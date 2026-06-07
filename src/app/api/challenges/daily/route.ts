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
import type {
  ChallengeType,
  DailyChallengeResponse,
  DodgeQueueRound,
  GuessEloRound,
  ItemBuildChallenge
} from "@/types";

export const runtime = "nodejs";
const PUBLIC_ROUND_LIMIT = 40;
const GUESS_ELO_ROUNDS_PER_BUCKET = 8;
const GUESS_ELO_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Platinum/Emerald", "Diamond/Master", "Grandmaster/Challenger"];

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

  const body: DailyChallengeResponse = compactDailyChallengeResponse({
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
        gameItems: liveItems,
        summonerSpells,
        timeBudgetMs: 18000
      })
    ),
    champions: publicChampions,
    items: liveItems,
    stats
  });

  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function compactDailyChallengeResponse(body: DailyChallengeResponse): DailyChallengeResponse {
  const itemBuild = compactItemBuildChallenge(body.extraChallenges.itemBuild);
  const guessEloRounds = selectBalancedGuessEloRounds(body.extraChallenges.guessElo.rounds ?? []).map(compactGuessEloRound);
  const dodgeQueueRounds = selectPublicRounds(body.extraChallenges.dodgeQueue.rounds ?? [], PUBLIC_ROUND_LIMIT).map(compactDodgeQueueRound);

  return {
    ...body,
    extraChallenges: {
      ...body.extraChallenges,
      itemBuild,
      guessElo: {
        ...(guessEloRounds[0] ?? compactGuessEloRound(body.extraChallenges.guessElo)),
        type: "guess-elo",
        rounds: guessEloRounds
      },
      dodgeQueue: {
        ...(dodgeQueueRounds[0] ?? compactDodgeQueueRound(body.extraChallenges.dodgeQueue)),
        type: "dodge-queue",
        rounds: dodgeQueueRounds
      }
    }
  };
}

function compactItemBuildChallenge(challenge: ItemBuildChallenge): ItemBuildChallenge {
  const rounds = selectPublicRounds(challenge.rounds ?? [], PUBLIC_ROUND_LIMIT).map(compactBuildRound);

  return {
    ...(rounds[0] ?? compactBuildRound(challenge)),
    type: "item-build",
    id: challenge.id,
    rounds
  };
}

function compactBuildRound(round: ItemBuildChallenge): ItemBuildChallenge {
  return {
    ...round,
    possibleItems: [],
    possibleBoots: [],
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactGuessEloRound(round: GuessEloRound): GuessEloRound {
  return {
    ...round,
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactDodgeQueueRound(round: DodgeQueueRound): DodgeQueueRound {
  return {
    ...round,
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactSourceMatch<T extends { matchData?: unknown } | undefined>(sourceMatch: T): T {
  if (!sourceMatch || !("matchData" in sourceMatch) || !sourceMatch.matchData) {
    return sourceMatch;
  }

  const compact = { ...sourceMatch };
  delete (compact as { matchData?: unknown }).matchData;
  return compact as T;
}

function selectBalancedGuessEloRounds(rounds: GuessEloRound[]) {
  const selected: GuessEloRound[] = [];
  const selectedIds = new Set<string>();

  for (const bucket of GUESS_ELO_BUCKETS) {
    const bucketRounds = rounds.filter((round) => round.answerTier === bucket);

    for (const round of selectPublicRounds(bucketRounds, GUESS_ELO_ROUNDS_PER_BUCKET)) {
      selected.push(round);
      selectedIds.add(round.id);
    }
  }

  if (selected.length < PUBLIC_ROUND_LIMIT) {
    const remaining = rounds.filter((round) => !selectedIds.has(round.id));
    selected.push(...selectPublicRounds(remaining, PUBLIC_ROUND_LIMIT - selected.length));
  }

  return selectPublicRounds(selected, PUBLIC_ROUND_LIMIT);
}

function selectPublicRounds<T>(rounds: T[], limit: number) {
  if (rounds.length <= limit) {
    return [...rounds];
  }

  const shuffled = [...rounds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, limit);
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
