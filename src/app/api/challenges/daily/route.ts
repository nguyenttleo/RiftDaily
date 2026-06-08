import { NextResponse } from "next/server";

import {
  ensureDailyChallenge,
  getDailyChallengeByDateType,
  getRecentAnswerIds
} from "@/db/repositories";
import { abilities, champions } from "@/game/data/champions";
import {
  createAbilityChallenge,
  createChampionChallenge,
  generateDailyChallengeSet,
  getUtcDateKey,
  seededIndex
} from "@/game/generators/daily";
import { generateExpandedDailyChallenges } from "@/game/generators/expanded";
import { BUILD_SHARE_PARAM, decodeBuildShareValue } from "@/lib/build-share";
import { readDailyPlayPayload, writeDailyPlayPayload } from "@/lib/daily-play-payload-cache";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion, getLiveGameItems, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedRankedMatchChallenges } from "@/lib/riot/match-v5";
import type {
  ChampionMatchupChallenge,
  ChampionMatchupRound,
  ChallengeType,
  DailyChallengeResponse,
  DailyChallengeStaticResponse,
  DodgeQueueRound,
  GameItem,
  GuessEloRound,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  PublicChampion,
  SummonerSpellRef
} from "@/types";

export const runtime = "nodejs";
const DEFAULT_PUBLIC_ROUND_LIMITS = {
  itemBuild: 20,
  guessElo: 20,
  championMatchup: 60,
  dodgeQueue: 20
} as const;
const MAX_PUBLIC_ROUND_LIMITS = {
  itemBuild: 50,
  guessElo: 40,
  championMatchup: 120,
  dodgeQueue: 40
} as const;
const GUESS_ELO_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Platinum/Emerald", "Diamond/Master", "Grandmaster/Challenger"];
const DAILY_CHALLENGE_CACHE_MS = 1000 * 60 * 10;
const DAILY_STATIC_PAYLOAD_CACHE_MS = 1000 * 60 * 5;
const DAILY_PLAY_PAYLOAD_CACHE_VERSION = "v3";

type PublicRoundLimits = {
  itemBuild: number;
  guessElo: number;
  championMatchup: number;
  dodgeQueue: number;
};
type DailyChallengeSet = ReturnType<typeof generateDailyChallengeSet>;
type ResolvedDailyChallengePair = [DailyChallengeSet["ability"], DailyChallengeSet["champion"]];
type DailyChallengeStaticBody = DailyChallengeStaticResponse;

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
  const roundLimits = parseRoundLimits(url.searchParams);
  const date = getUtcDateKey();
  const body = await resolveDailyStaticBody(date, requestedBuildRoundId, roundLimits);

  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=900, stale-while-revalidate=3600");
  response.headers.set("Vary", "Accept-Encoding");
  return response;
}

async function resolveDailyStaticBody(
  date: string,
  requestedBuildRoundId = "",
  roundLimits: PublicRoundLimits = DEFAULT_PUBLIC_ROUND_LIMITS
): Promise<DailyChallengeStaticBody> {
  const payloadProfile = dailyPayloadProfile(roundLimits);
  const cacheKey = dailyPayloadCacheKey(date, requestedBuildRoundId, roundLimits);

  if (cachedDailyStaticBody?.key === cacheKey && cachedDailyStaticBody.expiresAt > Date.now()) {
    return cachedDailyStaticBody.value;
  }

  const persistedPayload = await readDailyPlayPayload<DailyChallengeStaticBody>(cacheKey);

  if (persistedPayload) {
    cachedDailyStaticBody = {
      key: cacheKey,
      expiresAt: Date.now() + DAILY_STATIC_PAYLOAD_CACHE_MS,
      value: persistedPayload
    };

    return persistedPayload;
  }

  const version = await getLatestDataDragonVersion();
  const generated = generateDailyChallengeSet(version, env.challengeSalt, utcDateFromKey(date));

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
      compactRoundLimits: {
        buildRounds: roundLimits.itemBuild,
        guessEloRounds: roundLimits.guessElo,
        dodgeQueueRounds: roundLimits.dodgeQueue,
        championMatchupRounds: roundLimits.championMatchup
      },
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
  const compactValue = compactDailyStaticBody(value, requestedBuildRoundId, roundLimits);

  cachedDailyStaticBody = {
    key: cacheKey,
    expiresAt: Date.now() + DAILY_STATIC_PAYLOAD_CACHE_MS,
    value: compactValue
  };
  await writeDailyPlayPayload({
    cacheKey,
    product: "lol",
    date,
    profile: payloadProfile,
    dataDragonVersion: version,
    payload: compactValue,
    expiresAt: generated.resetAt
  });

  return compactValue;
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

function compactDailyStaticBody(
  body: DailyChallengeStaticBody,
  requestedBuildRoundId = "",
  roundLimits: PublicRoundLimits = DEFAULT_PUBLIC_ROUND_LIMITS
): DailyChallengeStaticBody {
  const compact = compactDailyChallengeResponse(
    {
      ...body,
      stats: emptyUserStats()
    },
    requestedBuildRoundId,
    roundLimits
  );
  const staticBody = { ...compact } as Partial<DailyChallengeResponse>;

  delete staticBody.stats;
  return staticBody as DailyChallengeStaticBody;
}

function compactDailyChallengeResponse(
  body: DailyChallengeResponse,
  requestedBuildRoundId = "",
  roundLimits: PublicRoundLimits = DEFAULT_PUBLIC_ROUND_LIMITS
): DailyChallengeResponse {
  const itemBuild = compactItemBuildChallenge(body.extraChallenges.itemBuild, requestedBuildRoundId, roundLimits.itemBuild);
  const itemRecipe = compactItemRecipeChallenge(body.extraChallenges.itemRecipe);
  const guessEloRounds = selectBalancedGuessEloRounds(body.extraChallenges.guessElo.rounds ?? [], roundLimits.guessElo).map(compactGuessEloRound);
  const dodgeQueueRounds = selectPublicRounds(body.extraChallenges.dodgeQueue.rounds ?? [], roundLimits.dodgeQueue).map(compactDodgeQueueRound);
  const championMatchup = compactChampionMatchupChallenge(body.extraChallenges.championMatchup, roundLimits.championMatchup);

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

function compactItemBuildChallenge(challenge: ItemBuildChallenge, requestedBuildRoundId = "", limit: number): ItemBuildChallenge {
  const sourceRounds = challenge.rounds ?? [];
  const rounds = selectPublicRoundsWithPinned(sourceRounds, limit, requestedBuildRoundId).map(compactBuildRound);

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
    ...compactItemRecipeRound(challenge),
    id: challenge.id,
    resultItem: compactGameItem(challenge.resultItem),
    knownComponents: challenge.knownComponents.map(compactGameItem),
    options: challenge.options.map(compactGameItem),
    allComponents: challenge.allComponents.map(compactGameItem),
    rounds: challenge.rounds?.map((round) => ({
      ...compactItemRecipeRound(round),
      options: [],
      allComponents: []
    }))
  };
}

function compactItemRecipeRound(round: ItemRecipeChallenge): ItemRecipeChallenge {
  return {
    ...round,
    resultItem: compactGameItem(round.resultItem),
    knownComponents: round.knownComponents.map(compactGameItem),
    options: round.options.map(compactGameItem),
    allComponents: round.allComponents.map(compactGameItem),
    rounds: undefined
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

function compactChampionMatchupChallenge(challenge: ChampionMatchupChallenge, limit: number): ChampionMatchupChallenge {
  const rounds = selectPublicRounds(challenge.rounds ?? [], limit).map(compactChampionMatchupRound);

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

function selectBalancedGuessEloRounds(rounds: GuessEloRound[], limit: number) {
  const selected: GuessEloRound[] = [];
  const selectedIds = new Set<string>();
  const baseRoundsPerBucket = Math.floor(limit / GUESS_ELO_BUCKETS.length);
  const extraBucketRounds = limit % GUESS_ELO_BUCKETS.length;

  for (const [bucketIndex, bucket] of GUESS_ELO_BUCKETS.entries()) {
    const bucketLimit = baseRoundsPerBucket + (bucketIndex < extraBucketRounds ? 1 : 0);

    if (bucketLimit <= 0) {
      continue;
    }

    const bucketRounds = rounds.filter((round) => round.answerTier === bucket);

    for (const round of selectPublicRounds(bucketRounds, bucketLimit)) {
      selected.push(round);
      selectedIds.add(round.id);
    }
  }

  if (selected.length < limit) {
    const remaining = rounds.filter((round) => !selectedIds.has(round.id));
    selected.push(...selectPublicRounds(remaining, limit - selected.length));
  }

  return selectPublicRounds(selected, limit);
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

function parseRoundLimits(searchParams: URLSearchParams): PublicRoundLimits {
  return {
    itemBuild: parseRoundLimit(searchParams, "buildRounds", DEFAULT_PUBLIC_ROUND_LIMITS.itemBuild, MAX_PUBLIC_ROUND_LIMITS.itemBuild),
    guessElo: parseRoundLimit(searchParams, "guessEloRounds", DEFAULT_PUBLIC_ROUND_LIMITS.guessElo, MAX_PUBLIC_ROUND_LIMITS.guessElo),
    championMatchup: parseRoundLimit(searchParams, "matchupRounds", DEFAULT_PUBLIC_ROUND_LIMITS.championMatchup, MAX_PUBLIC_ROUND_LIMITS.championMatchup),
    dodgeQueue: parseRoundLimit(searchParams, ["dodgeQueueRounds", "lobbyRounds"], DEFAULT_PUBLIC_ROUND_LIMITS.dodgeQueue, MAX_PUBLIC_ROUND_LIMITS.dodgeQueue)
  };
}

function dailyPayloadProfile(roundLimits: PublicRoundLimits) {
  return `lol:${roundLimits.itemBuild}:${roundLimits.guessElo}:${roundLimits.championMatchup}:${roundLimits.dodgeQueue}`;
}

function dailyPayloadCacheKey(date: string, requestedBuildRoundId: string, roundLimits: PublicRoundLimits) {
  return [
    DAILY_PLAY_PAYLOAD_CACHE_VERSION,
    dailyPayloadProfile(roundLimits),
    date,
    requestedBuildRoundId || "default"
  ].join(":");
}

function utcDateFromKey(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function emptyUserStats() {
  return {
    username: "Guest",
    currentStreak: 0,
    maxStreak: 0,
    gamesPlayed: 0,
    wins: 0,
    winRate: 0,
    perfectSolves: 0,
    fastestSolveMs: null,
    favoriteRole: "Unclaimed",
    rank: "Unranked",
    rankTier: "Unranked",
    rankDivision: null,
    rankLp: 0,
    lastLpChange: null,
    rankedGamesPlayed: 0,
    rankedWins: 0
  };
}

function parseRoundLimit(searchParams: URLSearchParams, keys: string | string[], defaultValue: number, maxValue: number) {
  const rawValue = (Array.isArray(keys) ? keys : [keys])
    .map((key) => searchParams.get(key))
    .find((value): value is string => Boolean(value));
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(1, Math.min(maxValue, Math.floor(parsed)));
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
