import { NextResponse } from "next/server";

import { ensureDailyChallenge, getDailyChallengeByDateType, getRecentAnswerIds } from "@/db/repositories";
import { abilities, champions } from "@/game/data/champions";
import {
  createAbilityChallenge,
  createChampionChallenge,
  getUtcDateKey,
  seededIndex
} from "@/game/generators/daily";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedRankedMatchChallenges, warmChampionMatchupSampleCache } from "@/lib/riot/match-v5";
import type { ChallengeType } from "@/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return generate(request);
}

export async function POST(request: Request) {
  return generate(request);
}

async function generate(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret") ?? "";

  if (env.cronSecret && token !== env.cronSecret) {
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
    const [publicChampions, summonerSpells] = await Promise.all([
      getLivePublicChampions(version),
      getLiveSummonerSpells(version)
    ]);
    const verified = await getVerifiedRankedMatchChallenges({
      date,
      dataDragonVersion: version,
      publicChampions,
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

    return NextResponse.json({
      ok: verified.status === "ready",
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
      }
    });
  }

  const includeVerified = mode === "verified" || url.searchParams.get("verified") === "1";

  if (!includeVerified) {
    return NextResponse.json({
      ok: true,
      date,
      mode,
      challenges: {
        ability,
        champion
      },
      verified: {
        skipped: true,
        message: "Daily challenge rows generated. Use mode=warm-matchups for small cache-warming batches."
      }
    });
  }

  const [publicChampions, summonerSpells] = await Promise.all([
    getLivePublicChampions(version),
    getLiveSummonerSpells(version)
  ]);
  const verified = await getVerifiedRankedMatchChallenges({
    date,
    dataDragonVersion: version,
    publicChampions,
    summonerSpells,
    allowLiveMatchupCollection: false,
    forceRefresh: url.searchParams.get("force") === "1",
    batchKey: url.searchParams.get("batch") ?? "",
    timeBudgetMs: numberParam(url, "budgetMs", 26000),
    matchSampleSize: numberParam(url, "sampleSize", env.riotMatchSampleSize || 100),
    buildSampleMatchCount: numberParam(url, "buildTarget", env.riotBuildSampleMatchCount || 512),
    matchHistoryPagesPerSource: numberParam(url, "pages", env.riotMatchHistoryPagesPerSource || 2)
  });

  return NextResponse.json({
    ok: true,
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
    }
  });
}

function numberParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key));

  return Number.isFinite(value) && value > 0 ? value : fallback;
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
