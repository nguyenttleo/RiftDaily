import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  ensureDailyChallenge,
  getDailyChallengeByDateType,
  getRecentAnswerIds,
  getUserStats
} from "@/db/repositories";
import { abilities, champions } from "@/game/data/champions";
import {
  createAbilityChallenge,
  createChampionChallenge,
  generateDailyChallengeSet,
  seededIndex
} from "@/game/generators/daily";
import { generateExpandedDailyChallenges } from "@/game/generators/expanded";
import { authOptions } from "@/lib/auth/options";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion, getLiveGameItems, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedRankedMatchChallenges } from "@/lib/riot/match-v5";
import type { ChallengeType, DailyChallengeResponse } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const version = await getLatestDataDragonVersion();
  const [publicChampions, liveItems, summonerSpells] = await Promise.all([
    getLivePublicChampions(version),
    getLiveGameItems(version),
    getLiveSummonerSpells(version)
  ]);
  const generated = generateDailyChallengeSet(version, env.challengeSalt);
  const session = await getServerSession(authOptions);

  let abilityChallenge = generated.ability;
  let championChallenge = generated.champion;

  if (isDatabaseConfigured()) {
    abilityChallenge = await resolveDailyAbilityChallenge(generated.date, version);
    championChallenge = await resolveDailyChampionChallenge(generated.date, version);
  }

  const stats = await getUserStats(session?.user?.id, session?.user?.username ?? session?.user?.name ?? "Guest");

  const body: DailyChallengeResponse = {
    date: generated.date,
    resetAt: generated.resetAt,
    dataDragonVersion: version,
    persistence: isDatabaseConfigured() ? "database" : "local",
    challenges: {
      ability: abilityChallenge.publicChallenge,
      champion: championChallenge.publicChallenge
    },
    extraChallenges: await generateExpandedDailyChallenges(
      version,
      env.challengeSalt,
      publicChampions,
      liveItems,
      await getVerifiedRankedMatchChallenges({
        date: generated.date,
        dataDragonVersion: version,
        publicChampions,
        summonerSpells,
        timeBudgetMs: 18000
      })
    ),
    champions: publicChampions,
    items: liveItems,
    stats
  };

  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

async function resolveDailyAbilityChallenge(date: string, version: string) {
  const existing = await getDailyChallengeByDateType(date, "ability");

  if (existing) {
    return createAbilityChallenge(existing.answer_id, existing.date, existing.seed, version, existing.id);
  }

  const recent = await getRecentAnswerIds("ability");
  const seed = `${env.challengeSalt}:${date}:ability`;
  const answerId = selectAnswerAvoidingRecent(
    "ability",
    seed,
    abilities.map((ability) => ability.id),
    recent
  );
  const challenge = createAbilityChallenge(answerId, date, seed, version);
  const row = await ensureDailyChallenge({
    date,
    challengeType: "ability",
    answerId,
    seed,
    difficulty: challenge.publicChallenge.difficulty
  });

  return row ? createAbilityChallenge(row.answer_id, row.date, row.seed, version, row.id) : challenge;
}

async function resolveDailyChampionChallenge(date: string, version: string) {
  const existing = await getDailyChallengeByDateType(date, "champion");

  if (existing) {
    return createChampionChallenge(existing.answer_id, existing.date, existing.seed, version, existing.id);
  }

  const recent = await getRecentAnswerIds("champion");
  const seed = `${env.challengeSalt}:${date}:champion`;
  const answerId = selectAnswerAvoidingRecent(
    "champion",
    seed,
    champions.map((champion) => champion.id),
    recent
  );
  const challenge = createChampionChallenge(answerId, date, seed, version);
  const row = await ensureDailyChallenge({
    date,
    challengeType: "champion",
    answerId,
    seed,
    difficulty: challenge.publicChallenge.difficulty
  });

  return row ? createChampionChallenge(row.answer_id, row.date, row.seed, version, row.id) : challenge;
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
