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
import { BUILD_SHARE_PARAM, decodeBuildShareValue } from "@/lib/build-share";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion, getLiveGameItems, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedRankedMatchChallenges } from "@/lib/riot/match-v5";
import type {
  ChampionMatchupChallenge,
  ChampionMatchupRound,
  ChallengeType,
  DailyChallengeResponse,
  DodgeQueueRound,
  GameItem,
  GuessEloRound,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  PublicChampion,
  SummonerSpellRef
} from "@/types";

export const runtime = "nodejs";
const PUBLIC_ROUND_LIMIT = 40;
const BUILD_PUBLIC_ROUND_LIMIT = 50;
const GUESS_ELO_ROUNDS_PER_BUCKET = 8;
const GUESS_ELO_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Platinum/Emerald", "Diamond/Master", "Grandmaster/Challenger"];
const DAILY_CHALLENGE_CACHE_MS = 1000 * 60 * 10;
const DAILY_STATIC_PAYLOAD_CACHE_MS = 1000 * 60 * 5;

type DailyChallengeSet = ReturnType<typeof generateDailyChallengeSet>;
type ResolvedDailyChallengePair = [DailyChallengeSet["ability"], DailyChallengeSet["champion"]];
type DailyChallengeStaticBody = Omit<DailyChallengeResponse, "stats">;

let cachedDailyChallengePair: {
  key: string;
  expiresAt: number;
  value: ResolvedDailyChallengePair;
} | null = null;
let cachedDailyStaticBody: {
  key: string;
  expiresAt: number;
  value: DailyChallengeStaticBody;
} | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedBuildRoundId = decodeBuildShareValue(url.searchParams.get(BUILD_SHARE_PARAM));
  const version = await getLatestDataDragonVersion();
  const generated = generateDailyChallengeSet(version, env.challengeSalt);
  const sessionPromise = getServerSession(authOptions);
  const statsPromise = sessionPromise.then((session) =>
    getUserStats(session?.user?.id, session?.user?.username ?? session?.user?.name ?? "Guest")
  );
  const [staticBody, stats] = await Promise.all([
    resolveDailyStaticBody(generated, version, requestedBuildRoundId),
    statsPromise
  ]);

  const body: DailyChallengeResponse = compactDailyChallengeResponse({
    ...staticBody,
    stats
  }, requestedBuildRoundId);

  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

async function resolveDailyStaticBody(generated: DailyChallengeSet, version: string, requestedBuildRoundId = ""): Promise<DailyChallengeStaticBody> {
  const cacheKey = `${generated.date}:${version}:${isDatabaseConfigured() ? "database" : "local"}:${requestedBuildRoundId || "default"}`;

  if (cachedDailyStaticBody?.key === cacheKey && cachedDailyStaticBody.expiresAt > Date.now()) {
    return cachedDailyStaticBody.value;
  }

  const dataDragonPromise = Promise.all([
    getLivePublicChampions(version),
    getLiveGameItems(version),
    getLiveSummonerSpells(version)
  ]);
  const challengePairPromise = resolveDailyChallengePair(generated, version);
  const verifiedMatchesPromise = dataDragonPromise.then(([publicChampions, liveItems, summonerSpells]) =>
    getVerifiedRankedMatchChallenges({
      date: generated.date,
      dataDragonVersion: version,
      publicChampions,
      gameItems: liveItems,
      summonerSpells,
      compactPersistedCache: true,
      pinnedBuildRoundId: requestedBuildRoundId,
      readOnlyCache: true
    })
  );
  const [
    [publicChampions, liveItems],
    [abilityChallenge, championChallenge],
    verifiedMatches
  ] = await Promise.all([
    dataDragonPromise,
    challengePairPromise,
    verifiedMatchesPromise
  ]);
  const value: DailyChallengeStaticBody = {
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
      verifiedMatches
    ),
    champions: publicChampions,
    items: liveItems
  };

  cachedDailyStaticBody = {
    key: cacheKey,
    expiresAt: Date.now() + DAILY_STATIC_PAYLOAD_CACHE_MS,
    value
  };

  return value;
}

async function resolveDailyChallengePair(generated: DailyChallengeSet, version: string): Promise<ResolvedDailyChallengePair> {
  if (!isDatabaseConfigured()) {
    return [generated.ability, generated.champion];
  }

  const cacheKey = `${generated.date}:${version}`;

  if (cachedDailyChallengePair?.key === cacheKey && cachedDailyChallengePair.expiresAt > Date.now()) {
    return cachedDailyChallengePair.value;
  }

  const value: ResolvedDailyChallengePair = await Promise.all([
    resolveDailyAbilityChallenge(generated.date, version),
    resolveDailyChampionChallenge(generated.date, version)
  ]);

  cachedDailyChallengePair = {
    key: cacheKey,
    expiresAt: Date.now() + DAILY_CHALLENGE_CACHE_MS,
    value
  };

  return value;
}

function compactDailyChallengeResponse(body: DailyChallengeResponse, requestedBuildRoundId = ""): DailyChallengeResponse {
  const itemBuild = compactItemBuildChallenge(body.extraChallenges.itemBuild, requestedBuildRoundId);
  const itemRecipe = compactItemRecipeChallenge(body.extraChallenges.itemRecipe);
  const guessEloRounds = selectBalancedGuessEloRounds(body.extraChallenges.guessElo.rounds ?? []).map(compactGuessEloRound);
  const dodgeQueueRounds = selectPublicRounds(body.extraChallenges.dodgeQueue.rounds ?? [], PUBLIC_ROUND_LIMIT).map(compactDodgeQueueRound);
  const championMatchup = compactChampionMatchupChallenge(body.extraChallenges.championMatchup);

  return {
    ...body,
    champions: [],
    items: body.items.map(compactGameItem),
    extraChallenges: {
      ...body.extraChallenges,
      itemBuild,
      itemRecipe,
      championMatchup,
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

function compactItemBuildChallenge(challenge: ItemBuildChallenge, requestedBuildRoundId = ""): ItemBuildChallenge {
  const sourceRounds = challenge.rounds ?? [];
  const rounds = selectPublicRoundsWithPinned(sourceRounds, BUILD_PUBLIC_ROUND_LIMIT, requestedBuildRoundId).map(compactBuildRound);

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
    champion: compactPublicChampion(round.champion),
    enemyTeam: round.enemyTeam.map(compactPublicChampion),
    allyTeam: round.allyTeam?.map(compactBuildPick),
    enemyPlayers: round.enemyPlayers?.map(compactBuildPick),
    candidates: [],
    possibleItems: [],
    possibleBoots: [],
    winrateStats: undefined,
    winrateSamples: undefined,
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactItemRecipeChallenge(challenge: ItemRecipeChallenge): ItemRecipeChallenge {
  return {
    ...challenge,
    resultItem: compactGameItem(challenge.resultItem),
    knownComponents: challenge.knownComponents.map(compactGameItem),
    options: challenge.options.map(compactGameItem),
    allComponents: challenge.allComponents.map(compactGameItem)
  };
}

function compactGameItem(item: GameItem): GameItem {
  return {
    id: item.id,
    name: item.name,
    plaintext: "",
    tags: item.tags,
    goldTotal: item.goldTotal,
    purchasable: item.purchasable,
    from: item.from,
    into: item.into,
    imageUrl: item.imageUrl
  };
}

function compactGuessEloRound(round: GuessEloRound): GuessEloRound {
  return {
    ...round,
    lanes: round.lanes.map(compactEloLane),
    enemyLanes: round.enemyLanes.map(compactEloLane),
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactDodgeQueueRound(round: DodgeQueueRound): DodgeQueueRound {
  return {
    ...round,
    allyTeam: round.allyTeam.map(compactPublicChampion),
    enemyTeam: round.enemyTeam.map(compactPublicChampion),
    allyBans: round.allyBans.map(compactPublicChampion),
    enemyBans: round.enemyBans.map(compactPublicChampion),
    allySpells: round.allySpells.map((spells) => spells.map(compactSummonerSpell)),
    enemySpells: round.enemySpells.map((spells) => spells.map(compactSummonerSpell)),
    sourceMatch: compactSourceMatch(round.sourceMatch)
  };
}

function compactChampionMatchupChallenge(challenge: ChampionMatchupChallenge): ChampionMatchupChallenge {
  const rounds = (challenge.rounds ?? []).map(compactChampionMatchupRound);

  return {
    ...(rounds[0] ?? compactChampionMatchupRound(challenge)),
    type: "champion-matchup",
    rounds
  };
}

function compactChampionMatchupRound(round: ChampionMatchupRound): ChampionMatchupRound {
  return {
    ...round,
    left: {
      ...round.left,
      champion: compactPublicChampion(round.left.champion)
    },
    right: {
      ...round.right,
      champion: compactPublicChampion(round.right.champion)
    }
  };
}

function compactBuildPick(pick: NonNullable<ItemBuildChallenge["allyTeam"]>[number]): NonNullable<ItemBuildChallenge["allyTeam"]>[number] {
  return {
    ...pick,
    champion: compactPublicChampion(pick.champion),
    spells: pick.spells?.map(compactSummonerSpell)
  };
}

function compactEloLane(lane: GuessEloRound["lanes"][number]): GuessEloRound["lanes"][number] {
  return {
    ...lane,
    champion: compactPublicChampion(lane.champion),
    spells: lane.spells.map(compactSummonerSpell)
  };
}

function compactPublicChampion(champion: PublicChampion): PublicChampion {
  return {
    id: champion.id,
    ...(typeof champion.key === "number" ? { key: champion.key } : {}),
    name: champion.name,
    title: champion.title,
    roles: champion.roles,
    region: "",
    resource: champion.resource,
    gender: "",
    releaseYear: 0,
    squareUrl: champion.squareUrl,
    splashUrl: champion.splashUrl
  };
}

function compactSummonerSpell(spell: SummonerSpellRef): SummonerSpellRef {
  return {
    id: spell.id,
    key: "",
    name: spell.name,
    iconUrl: spell.iconUrl
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

function selectPublicRoundsWithPinned<T extends { id: string }>(rounds: T[], limit: number, pinnedId = "") {
  if (!pinnedId) {
    return selectPublicRounds(rounds, limit);
  }

  const pinnedRound = rounds.find((round) => round.id === pinnedId);

  if (!pinnedRound) {
    return selectPublicRounds(rounds, limit);
  }

  if (rounds.length <= limit) {
    return [pinnedRound, ...rounds.filter((round) => round.id !== pinnedRound.id)];
  }

  return [
    pinnedRound,
    ...selectPublicRounds(rounds.filter((round) => round.id !== pinnedRound.id), limit - 1)
  ];
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
