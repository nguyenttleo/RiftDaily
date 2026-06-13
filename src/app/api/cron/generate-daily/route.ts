import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ensureDailyChallenge, getDailyChallengeByDateType, getRecentAnswerIds } from "@/db/repositories";
import { abilities, champions } from "@/game/data/champions";
import {
  createAbilityChallenge,
  createChampionChallenge,
  getUtcDateKey,
  seededIndex
} from "@/game/generators/daily";
import { pruneExpiredDailyPlayPayloads } from "@/lib/daily-play-payload-cache";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion, getLiveGameItems, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedRankedMatchChallenges, warmChampionMatchupSampleCache } from "@/lib/riot/match-v5";
import { logSecurityEvent, requestIp, requestUserAgent } from "@/lib/security/audit-log";
import type { ChallengeType } from "@/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  logSecurityEvent({
    type: "cron_method_denied",
    severity: "low",
    route: "/api/cron/generate-daily",
    outcome: "denied",
    ip: requestIp(request),
    userAgent: requestUserAgent(request),
    metadata: {
      method: "GET"
    }
  });

  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  return generate(request);
}

async function generate(request: Request) {
  const cronSecret = env.cronSecret.trim();

  if (!cronSecret) {
    logSecurityEvent({
      type: "cron_secret_missing",
      severity: "high",
      route: "/api/cron/generate-daily",
      outcome: "failed",
      ip: requestIp(request),
      userAgent: requestUserAgent(request)
    });

    return NextResponse.json({ error: "Cron route is not configured." }, { status: 503 });
  }

  const token = readCronToken(request);

  if (!token || !secureTokenEquals(token, cronSecret)) {
    logSecurityEvent({
      type: "cron_secret_denied",
      severity: "medium",
      route: "/api/cron/generate-daily",
      outcome: "denied",
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        hasToken: Boolean(token)
      }
    });

    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      persistence: "local",
      message: "DATABASE_URL is not configured; daily challenges will be generated in memory."
    });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getUtcDateKey();
  const mode = url.searchParams.get("mode") ?? "daily";
  const version = await getLatestDataDragonVersion();
  const ability = await ensureChallenge("ability", date, version);
  const champion = await ensureChallenge("champion", date, version);

  if (mode === "warm-play-payloads") {
    const [playPayloads, prunedPayloads] = await Promise.all([
      warmPlayPayloads(url),
      pruneExpiredDailyPlayPayloads()
    ]);

    return NextResponse.json({
      ok: playPayloads.every((payload) => payload.ok),
      date,
      mode,
      challenges: {
        ability,
        champion
      },
      playPayloads,
      prunedPayloads
    });
  }

  if (mode === "warm-matchups") {
    const publicChampions = await getLivePublicChampions(version);
    const warmResult = await warmChampionMatchupSampleCache({
      date,
      dataDragonVersion: version,
      publicChampions,
      batchKey: url.searchParams.get("batch") ?? String(Math.floor(Date.now() / 600000)),
      currentPatchMatchTarget: numberParam(url, "target", 12),
      sourceCountPerBucket: numberParam(url, "sources", 1),
      matchHistoryPagesPerSource: numberParam(url, "pages", 1),
      timeBudgetMs: numberParam(url, "budgetMs", 22000)
    });

    return NextResponse.json({
      ok: warmResult.status === "ready",
      date,
      mode,
      challenges: {
        ability,
        champion
      },
      warmResult
    });
  }

  if (mode === "warm-verified" || mode === "warm-samples") {
    const [publicChampions, summonerSpells, gameItems] = await Promise.all([
      getLivePublicChampions(version),
      getLiveSummonerSpells(version),
      getLiveGameItems(version)
    ]);
    const verified = await getVerifiedRankedMatchChallenges({
      date,
      dataDragonVersion: version,
      publicChampions,
      gameItems,
      summonerSpells,
      allowLiveMatchupCollection: false,
      forceRefresh: true,
      batchKey: url.searchParams.get("batch") ?? String(Math.floor(Date.now() / 600000)),
      timeBudgetMs: numberParam(url, "budgetMs", 24000),
      matchSampleSize: numberParam(url, "sampleSize", env.riotMatchSampleSize || 100),
      buildSampleMatchCount: numberParam(url, "buildTarget", Math.max(512, env.riotBuildSampleMatchCount || 512)),
      matchHistoryPagesPerSource: numberParam(url, "pages", Math.max(2, env.riotMatchHistoryPagesPerSource || 2))
    });
    const buildSamples = Object.values(verified.championWinrateSamples);
    const buildSampleGames = buildSamples.reduce((total, sample) => total + sample.games, 0);
    const topBuildSamples = buildSamples
      .sort((a, b) => b.games - a.games || a.championName.localeCompare(b.championName))
      .slice(0, 8)
      .map((sample) => ({
        champion: sample.championName,
        games: sample.games,
        winRate: sample.winRate
      }));
    const playPayloads = await warmPlayPayloads(url);

    return NextResponse.json({
      ok: verified.status === "ready" && playPayloads.every((payload) => payload.ok),
      date,
      mode,
      challenges: {
        ability,
        champion
      },
      verified: {
        buildRounds: verified.buildRounds.length,
        guessEloRounds: verified.guessEloRounds.length,
        dodgeQueueRounds: verified.dodgeQueueRounds.length,
        championMatchupRounds: verified.championMatchupRounds.length,
        buildSampleChampions: buildSamples.length,
        buildSampleGames,
        topBuildSamples,
        status: verified.status,
        message: verified.message
      },
      playPayloads
    });
  }

  const includeVerified = mode === "verified" || url.searchParams.get("verified") === "1";

  if (!includeVerified) {
    const playPayloads = await warmPlayPayloads(url);

    return NextResponse.json({
      ok: playPayloads.every((payload) => payload.ok),
      date,
      mode,
      challenges: {
        ability,
        champion
      },
      verified: {
        skipped: true,
        message: "Daily challenge rows generated. Use mode=warm-matchups for small cache-warming batches."
      },
      playPayloads
    });
  }

  const [publicChampions, summonerSpells, gameItems] = await Promise.all([
    getLivePublicChampions(version),
    getLiveSummonerSpells(version),
    getLiveGameItems(version)
  ]);
  const verified = await getVerifiedRankedMatchChallenges({
    date,
    dataDragonVersion: version,
    publicChampions,
    gameItems,
    summonerSpells,
    allowLiveMatchupCollection: false,
    forceRefresh: url.searchParams.get("force") === "1",
    batchKey: url.searchParams.get("batch") ?? "",
    timeBudgetMs: numberParam(url, "budgetMs", 26000),
    matchSampleSize: numberParam(url, "sampleSize", env.riotMatchSampleSize || 100),
    buildSampleMatchCount: numberParam(url, "buildTarget", env.riotBuildSampleMatchCount || 512),
    matchHistoryPagesPerSource: numberParam(url, "pages", env.riotMatchHistoryPagesPerSource || 2)
  });
  const playPayloads = await warmPlayPayloads(url);

  return NextResponse.json({
    ok: playPayloads.every((payload) => payload.ok),
    date,
    challenges: {
      ability,
      champion
    },
    verified: {
      buildRounds: verified.buildRounds.length,
      guessEloRounds: verified.guessEloRounds.length,
      dodgeQueueRounds: verified.dodgeQueueRounds.length,
      championMatchupRounds: verified.championMatchupRounds.length,
      status: verified.status,
      message: verified.message
    },
    playPayloads
  });
}

function numberParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key));

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function warmPlayPayloads(requestUrl: URL) {
  const origin = new URL(env.appUrl || requestUrl.origin);
  const targets = [
    {
      label: "lol-initial",
      path: "/api/challenges/daily?buildRounds=20&guessEloRounds=20&matchupRounds=60&dodgeQueueRounds=20"
    },
    {
      label: "lol-expanded",
      path: "/api/challenges/daily?buildRounds=50&guessEloRounds=40&matchupRounds=120&dodgeQueueRounds=40"
    },
    {
      label: "tft-daily",
      path: "/api/tft/daily"
    }
  ];
  const warmed = [];

  for (const target of targets) {
    warmed.push(await warmPlayPayload(origin, target.label, target.path));
  }

  return warmed;
}

async function warmPlayPayload(origin: URL, label: string, path: string) {
  const url = new URL(path, origin);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "x-rift-warm": "1"
      }
    });
    const text = await response.text();
    const payload = parseJson(text);

    return {
      label,
      ok: response.ok,
      status: response.status,
      bytes: Buffer.byteLength(text, "utf8"),
      durationMs: Date.now() - startedAt,
      rounds: payload ? payloadRoundCounts(payload) : undefined
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      bytes: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Payload warm failed."
    };
  }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function payloadRoundCounts(payload: Record<string, unknown>) {
  const extraChallenges = payload.extraChallenges as Record<string, { rounds?: unknown[] }> | undefined;
  const recipe = payload.recipe as { rounds?: unknown[] } | undefined;
  const connections = payload.connections as { rounds?: unknown[] } | undefined;

  if (extraChallenges) {
    return {
      build: extraChallenges.itemBuild?.rounds?.length ?? 0,
      recipe: extraChallenges.itemRecipe?.rounds?.length ?? 0,
      elo: extraChallenges.guessElo?.rounds?.length ?? 0,
      matchup: extraChallenges.championMatchup?.rounds?.length ?? 0,
      lobby: extraChallenges.dodgeQueue?.rounds?.length ?? 0
    };
  }

  return {
    tftRecipes: recipe?.rounds?.length ?? 0,
    tftConnections: connections?.rounds?.length ?? 0
  };
}

async function ensureChallenge(type: ChallengeType, date: string, version: string) {
  const existing = await getDailyChallengeByDateType(date, type);

  if (existing) {
    return {
      id: existing.id,
      type,
      answerId: existing.answer_id,
      existed: true
    };
  }

  const seed = `${env.challengeSalt}:${date}:${type}`;
  const candidates = type === "ability" ? abilities.map((ability) => ability.id) : champions.map((champion) => champion.id);
  const recent = await getRecentAnswerIds(type);
  const answerId = selectAnswerAvoidingRecent(type, seed, candidates, recent);
  const challenge =
    type === "ability"
      ? createAbilityChallenge(answerId, date, seed, version)
      : createChampionChallenge(answerId, date, seed, version);
  const row = await ensureDailyChallenge({
    date,
    challengeType: type,
    answerId,
    seed,
    difficulty: challenge.publicChallenge.difficulty
  });

  return {
    id: row?.id ?? challenge.publicChallenge.id,
    type,
    answerId,
    existed: false
  };
}

function selectAnswerAvoidingRecent(type: ChallengeType, seed: string, answerIds: string[], recent: string[]): string {
  const start = seededIndex(`${seed}:${type}:answer`, answerIds.length);
  const recentSet = new Set(recent);

  for (let offset = 0; offset < answerIds.length; offset += 1) {
    const answer = answerIds[(start + offset) % answerIds.length];

    if (!recentSet.has(answer)) {
      return answer;
    }
  }

  return answerIds[start];
}

function readCronToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearerToken || request.headers.get("x-cron-secret")?.trim() || "";
}

function secureTokenEquals(leftValue: string, rightValue: string) {
  const left = createHash("sha256").update(leftValue).digest();
  const right = createHash("sha256").update(rightValue).digest();

  return timingSafeEqual(left, right);
}
