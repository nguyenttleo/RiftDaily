import { query } from "@/db/client";
import { env, isDatabaseConfigured, isRiotApiConfigured } from "@/lib/env";
import type {
  BuildWinrateStats,
  ChampionMatchupRound,
  DodgeQueueRound,
  GuessEloRound,
  PublicChampion,
  SummonerSpellRef,
  VerifiedMatchData
} from "@/types";

const RANKED_SOLO_QUEUE_ID = 420;
const SUMMONERS_RIFT_MAP_ID = 11;
const CLASSIC_GAME_MODE = "CLASSIC";
const SMITE_ID = 11;
const TEAM_IDS = [100, 200] as const;
const POSITION_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const RANK_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Platinum/Emerald", "Diamond/Master", "Grandmaster/Challenger"] as const;
const MIN_PLAYABLE_ROUNDS_PER_RANK = 1;
const MIN_BUILD_SAMPLE_GAMES = 5;
const DEFAULT_BUILD_SAMPLE_MATCH_COUNT = 512;
const MAX_BUILD_SAMPLE_MATCH_COUNT = 5000;
const MIN_MATCHUP_SAMPLE_GAMES = 20;
const TARGET_MATCHUP_ROUNDS = 16;
const MATCH_IDS_PER_REQUEST = 100;
const MATCH_IDS_PER_PLAY_SOURCE = 20;
const MATCH_IDS_PER_WARM_SOURCE_PASS = 25;
const LEAGUE_ENTRY_PAGES_PER_BUCKET = 3;
const MAX_MATCH_HISTORY_PAGES_PER_SOURCE = 5;
const MAX_CURRENT_PATCH_MATCHUP_SAMPLE_SIZE = 20000;
const MAX_ANALYSIS_MATCH_FETCH_BUDGET = 40000;
const MAX_SOURCES_PER_RANK_BUCKET = 48;
const RIOT_REQUEST_TIMEOUT_MS = 8000;
const RIOT_MIN_REQUEST_INTERVAL_MS = 140;
const RIOT_MAX_RETRY_AFTER_MS = 5000;

let nextRiotRequestAt = 0;

type TeamId = (typeof TEAM_IDS)[number];
type RiotPosition = (typeof POSITION_ORDER)[number];
type RankBucket = (typeof RANK_BUCKETS)[number];

interface RiotLeagueEntry {
  puuid?: string;
  summonerId?: string;
  tier?: string;
  rank?: string;
}

interface RiotLeagueList {
  tier?: string;
  entries: RiotLeagueEntry[];
}

interface RiotSummonerDto {
  puuid: string;
}

interface RiotMatchDto {
  metadata: {
    matchId: string;
  };
  info: {
    gameVersion: string;
    gameCreation?: number;
    gameStartTimestamp?: number;
    gameDuration?: number;
    gameId?: number;
    mapId: number;
    queueId: number;
    gameMode: string;
    participants: RiotParticipantDto[];
    teams: RiotTeamDto[];
  };
}

interface RiotParticipantDto {
  puuid: string;
  teamId: TeamId;
  championId: number;
  championName: string;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  teamPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  champLevel: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
}

interface RiotTeamDto {
  teamId: TeamId;
  win: boolean;
  bans?: Array<{
    championId: number;
    pickTurn: number;
  }>;
}

interface RankedSource {
  puuid: string;
  bucket: RankBucket;
  tier: string;
}

interface RankedEntryCandidate {
  entry: RiotLeagueEntry;
  tier: string;
  division?: string;
}

export interface VerifiedMatchChallengeSet {
  guessEloRounds: GuessEloRound[];
  dodgeQueueRounds: DodgeQueueRound[];
  championMatchupRounds: ChampionMatchupRound[];
  championWinrateSamples: Record<string, BuildWinrateStats>;
  status: "ready" | "unconfigured" | "unavailable";
  message?: string;
  guessEloMessage?: string;
  dodgeQueueMessage?: string;
  championMatchupMessage?: string;
}

export interface ChampionMatchupWarmResult {
  status: "ready" | "unconfigured" | "unavailable";
  message?: string;
  patchPrefix: string;
  batchKey: string;
  requestedCurrentPatchMatches: number;
  sourcesChecked: number;
  matchIdsChecked: number;
  riotMatchesFetched: number;
  currentPatchMatches: number;
  insertedRowsAttempted: number;
  validTwentyGamePairs: number;
}

interface WinrateAccumulator {
  championName: string;
  wins: number;
  games: number;
  matchIds: Set<string>;
  gamesWithItems: Array<{
    win: boolean;
    matchId: string;
    itemIds: string[];
    enemyChampionIds: string[];
  }>;
}

interface ChampionLanePick {
  champion: PublicChampion;
  position: RiotPosition;
  role: string;
  teamId: TeamId;
}

interface ChampionMatchupAccumulator {
  left: ChampionLanePick;
  right: ChampionLanePick;
  leftWins: number;
  games: number;
  matchIds: Set<string>;
}

interface ChampionMatchupSampleRecord {
  matchId: string;
  platform: string;
  gameVersion: string;
  gameCreation?: number;
  leftChampionId: string;
  leftRole: string;
  rightChampionId: string;
  rightRole: string;
  leftWon: boolean;
}

interface PersistedMatchupAggregateRow {
  left_champion_id: string;
  left_role: string;
  right_champion_id: string;
  right_role: string;
  games: string | number;
  left_wins: string | number;
  sample_matches: string | number;
}

interface VerifiedMatchCacheRow {
  payload: VerifiedMatchChallengeSet;
}

let cachedMatchSet: {
  key: string;
  expiresAt: number;
  value: VerifiedMatchChallengeSet;
} | null = null;
let matchupSampleTableReady: Promise<void> | null = null;
let verifiedMatchCacheTableReady: Promise<void> | null = null;

export async function getVerifiedRankedMatchChallenges({
  date,
  dataDragonVersion,
  publicChampions,
  summonerSpells,
  allowLiveMatchupCollection = false,
  timeBudgetMs = 26000,
  matchSampleSize,
  buildSampleMatchCount,
  matchupSampleMatchCount,
  matchHistoryPagesPerSource,
  batchKey = "",
  forceRefresh = false
}: {
  date: string;
  dataDragonVersion: string;
  publicChampions: PublicChampion[];
  summonerSpells: SummonerSpellRef[];
  allowLiveMatchupCollection?: boolean;
  timeBudgetMs?: number;
  matchSampleSize?: number;
  buildSampleMatchCount?: number;
  matchupSampleMatchCount?: number;
  matchHistoryPagesPerSource?: number;
  batchKey?: string;
  forceRefresh?: boolean;
}): Promise<VerifiedMatchChallengeSet> {
  if (!isRiotApiConfigured()) {
    return {
      guessEloRounds: [],
      dodgeQueueRounds: [],
      championMatchupRounds: [],
      championWinrateSamples: {},
      status: "unconfigured",
      message: "RIOT_API_KEY is required for verified lane assignment and summoner spell data."
    };
  }

  const platform = normalizePlatform(env.riotRegion);
  const regional = regionalRouteForPlatform(platform);
  const startedAt = Date.now();
  const isTimedOut = () => Date.now() - startedAt > timeBudgetMs;
  const requestedSampleSizeValue = matchSampleSize ?? env.riotMatchSampleSize;
  const requestedSampleSize = Number.isFinite(requestedSampleSizeValue) ? Math.max(RANK_BUCKETS.length, Math.min(100, requestedSampleSizeValue)) : 100;
  const roundsPerRank = Math.max(1, Math.floor(requestedSampleSize / RANK_BUCKETS.length));
  const sampleSize = roundsPerRank * RANK_BUCKETS.length;
  const initialRoundsPerRank = Math.min(roundsPerRank, MIN_PLAYABLE_ROUNDS_PER_RANK);
  const requestedBuildSampleValue = buildSampleMatchCount ?? env.riotBuildSampleMatchCount;
  const requestedBuildSampleSize = Number.isFinite(requestedBuildSampleValue)
    ? Math.max(sampleSize, Math.min(MAX_BUILD_SAMPLE_MATCH_COUNT, requestedBuildSampleValue))
    : DEFAULT_BUILD_SAMPLE_MATCH_COUNT;
  const requestedMatchupSampleValue = matchupSampleMatchCount ?? env.riotMatchupSampleMatchCount;
  const requestedMatchupSampleSize = Number.isFinite(requestedMatchupSampleValue)
    ? Math.max(sampleSize, Math.min(MAX_CURRENT_PATCH_MATCHUP_SAMPLE_SIZE, requestedMatchupSampleValue))
    : 1600;
  const requestedHistoryPages = matchHistoryPagesPerSource ?? env.riotMatchHistoryPagesPerSource;
  const boundedMatchHistoryPagesPerSource = Number.isFinite(requestedHistoryPages)
    ? Math.max(1, Math.min(MAX_MATCH_HISTORY_PAGES_PER_SOURCE, requestedHistoryPages))
    : 2;
  const currentPatchPrefix = patchPrefixFromVersion(dataDragonVersion);
  const championLookup = createChampionLookup(publicChampions);
  const persistedChampionMatchupRounds = await getPersistedChampionMatchupRounds(date, publicChampions, currentPatchPrefix);
  const shouldCollectLiveMatchups = allowLiveMatchupCollection && persistedChampionMatchupRounds.length < TARGET_MATCHUP_ROUNDS;
  const analysisTargetMatchCount = Math.max(requestedBuildSampleSize, shouldCollectLiveMatchups ? requestedMatchupSampleSize : sampleSize);
  const analysisFetchBudget = shouldCollectLiveMatchups
    ? Math.min(MAX_ANALYSIS_MATCH_FETCH_BUDGET, Math.max(analysisTargetMatchCount, requestedMatchupSampleSize * 3))
    : Math.max(analysisTargetMatchCount, requestedBuildSampleSize * 3);
  const matchIdsPerSourceBudget = MATCH_IDS_PER_REQUEST * (shouldCollectLiveMatchups ? boundedMatchHistoryPagesPerSource : 1);
  const analysisMatchesPerRank = Math.max(roundsPerRank, Math.ceil(analysisFetchBudget / RANK_BUCKETS.length));
  const sourceCountPerBucket = Math.min(MAX_SOURCES_PER_RANK_BUCKET, Math.max(4, Math.ceil(analysisMatchesPerRank / matchIdsPerSourceBudget) + 1));
  const cacheKey = `${date}:${platform}:${currentPatchPrefix}:${sampleSize}:${requestedBuildSampleSize}:${analysisFetchBudget}:${sourceCountPerBucket}:${boundedMatchHistoryPagesPerSource}:${persistedChampionMatchupRounds.length}`;
  const persistedCacheKey = `${date}:${platform}:${currentPatchPrefix}:${sampleSize}:${requestedBuildSampleSize}:${boundedMatchHistoryPagesPerSource}:verified-rounds`;

  if (!forceRefresh && cachedMatchSet?.key === cacheKey && cachedMatchSet.expiresAt > Date.now()) {
    return cachedMatchSet.value;
  }

  const persistedVerifiedSet = await getPersistedVerifiedMatchCache(persistedCacheKey);

  if (!forceRefresh && persistedVerifiedSet && hasBuildWinrateSamplesRecord(persistedVerifiedSet.championWinrateSamples)) {
    const value = mergePersistedMatchupsIntoVerifiedSet(persistedVerifiedSet, persistedChampionMatchupRounds);

    cachedMatchSet = {
      key: cacheKey,
      expiresAt: Date.now() + 1000 * 60 * 60 * 2,
      value
    };

    return value;
  }

  try {
    const batchSeed = batchKey || String(Math.floor(Date.now() / 600000));
    const sources = await getRankedSources(platform, `${date}:${batchSeed}`, sourceCountPerBucket);
    const sourcesByBucket = groupSourcesByBucket(sources);
    const spellLookup = new Map(summonerSpells.map((spell) => [spell.id, spell]));
    const seenMatches = new Set<string>();
    const guessRoundsByBucket = createEmptyRankBucketMap();
    const dodgeQueueRounds: DodgeQueueRound[] = [];
    const championWinrates = new Map<string, WinrateAccumulator>();
    const championMatchupSamples = new Map<string, ChampionMatchupAccumulator>();
    const currentPatchMatchupMatchIds = new Set<string>();
    const matchupSampleRecords: ChampionMatchupSampleRecord[] = [];
    const flushMatchupSampleRecords = async (force = false) => {
      if (matchupSampleRecords.length < 800 && !force) {
        return;
      }

      const records = matchupSampleRecords.splice(0, matchupSampleRecords.length);
      await persistChampionMatchupSamples(records);
    };
    const collectMatchupSamples = async (match: RiotMatchDto) => {
      const records = addChampionHeadToHeadSamples(match, platform, championLookup, championMatchupSamples, currentPatchPrefix);

      if (records.length > 0) {
        currentPatchMatchupMatchIds.add(match.metadata.matchId);
        matchupSampleRecords.push(...records);
      }

      await flushMatchupSampleRecords();
    };

    for (const bucket of RANK_BUCKETS) {
      if (isTimedOut()) {
        break;
      }

      const bucketRounds = guessRoundsByBucket.get(bucket) ?? [];
      const bucketSources = sourcesByBucket.get(bucket) ?? [];

      for (const source of bucketSources) {
        if (bucketRounds.length >= initialRoundsPerRank || isTimedOut()) {
          break;
        }

        let matchIds: string[] = [];

        try {
          matchIds = await getRankedMatchIdsForSource(regional, source.puuid, 1, MATCH_IDS_PER_PLAY_SOURCE);
        } catch {
          continue;
        }

        for (const matchId of seededOrder(matchIds, `${date}:${batchSeed}:${source.bucket}:${source.puuid}`)) {
          if (bucketRounds.length >= initialRoundsPerRank || isTimedOut()) {
            break;
          }

          if (seenMatches.has(matchId)) {
            continue;
          }

          seenMatches.add(matchId);

          try {
            const match = await riotFetch<RiotMatchDto>(regional, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);

            if (!isRankedClassicSummonersRiftMatch(match)) {
              continue;
            }

            addChampionWinrateSamples(match, championLookup, championWinrates);
            await collectMatchupSamples(match);

            const verified = toVerifiedRounds(match, source, platform, championLookup, spellLookup, date);

            if (!verified) {
              continue;
            }

            const usedForPuzzleRound = bucketRounds.length < initialRoundsPerRank;

            if (dodgeQueueRounds.length < sampleSize) {
              dodgeQueueRounds.push(verified.dodgeQueue);
            }

            if (usedForPuzzleRound) {
              bucketRounds.push(verified.guessElo);
            }
          } catch {
            continue;
          }
        }
      }
    }

    for (const source of interleaveRankedSources(sourcesByBucket, `${date}:analysis-sources`)) {
      const bucketRounds = guessRoundsByBucket.get(source.bucket) ?? [];
      const bucketRoundLimit = nextBalancedRankBucketLimit(guessRoundsByBucket, initialRoundsPerRank, roundsPerRank);

      if (bucketRounds.length >= bucketRoundLimit) {
        continue;
      }

      if (
        isTimedOut() ||
        isAnalysisComplete(
          seenMatches.size,
          currentPatchMatchupMatchIds.size,
          requestedBuildSampleSize,
          requestedMatchupSampleSize,
          shouldCollectLiveMatchups,
          championWinrates,
          championMatchupSamples
        ) ||
        seenMatches.size >= analysisFetchBudget
      ) {
        break;
      }

      let matchIds: string[] = [];

      try {
        matchIds = await getRankedMatchIdsForSource(
          regional,
          source.puuid,
      boundedMatchHistoryPagesPerSource,
          shouldCollectLiveMatchups ? MATCH_IDS_PER_REQUEST : MATCH_IDS_PER_PLAY_SOURCE
        );
      } catch {
        continue;
      }

      for (const matchId of seededOrder(matchIds, `${date}:analysis:${batchSeed}:${source.bucket}:${source.puuid}`)) {
        if (
          isTimedOut() ||
          isAnalysisComplete(
            seenMatches.size,
            currentPatchMatchupMatchIds.size,
            requestedBuildSampleSize,
            requestedMatchupSampleSize,
            shouldCollectLiveMatchups,
            championWinrates,
            championMatchupSamples
          ) ||
          seenMatches.size >= analysisFetchBudget
        ) {
          break;
        }

        if (seenMatches.has(matchId)) {
          continue;
        }

        seenMatches.add(matchId);

        try {
          const match = await riotFetch<RiotMatchDto>(regional, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);

          if (!isRankedClassicSummonersRiftMatch(match)) {
            continue;
          }

          addChampionWinrateSamples(match, championLookup, championWinrates);
          await collectMatchupSamples(match);

          const verified = toVerifiedRounds(match, source, platform, championLookup, spellLookup, date);

          if (verified) {
            if (bucketRounds.length < bucketRoundLimit) {
              bucketRounds.push(verified.guessElo);
            }

            if (dodgeQueueRounds.length < sampleSize) {
              dodgeQueueRounds.push(verified.dodgeQueue);
            }

            if (bucketRounds.length >= bucketRoundLimit) {
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }

    await flushMatchupSampleRecords(true);

    const collectedGuessEloRounds = interleaveRankBuckets(guessRoundsByBucket, roundsPerRank);
    const distribution = rankDistribution(collectedGuessEloRounds);
    const guessEloRounds = orderRoundsWithoutConsecutivePlayers(collectedGuessEloRounds, `${date}:guess-elo-round-order`, guessEloRoundPlayers);
    const orderedDodgeQueueRounds = orderRoundsWithoutConsecutivePlayers(dodgeQueueRounds, `${date}:dodge-queue-round-order`, dodgeQueueRoundPlayers);
    const championWinrateSamples = toChampionWinrateSamples(championWinrates);
    const hasVerifiedBuildSamples = hasBuildWinrateCandidate(championWinrates);
    const liveChampionMatchupRounds = toChampionMatchupRounds(championMatchupSamples, date);
    const refreshedPersistedChampionMatchupRounds = await getPersistedChampionMatchupRounds(date, publicChampions, currentPatchPrefix);
    const championMatchupRounds = mergeChampionMatchupRounds(refreshedPersistedChampionMatchupRounds, liveChampionMatchupRounds);
    const hasBalancedGuessRounds =
      guessEloRounds.length === sampleSize &&
      RANK_BUCKETS.every((bucket) => distribution[bucket] === roundsPerRank);
    const hasPlayableGuessRounds =
      guessEloRounds.length >= RANK_BUCKETS.length &&
      RANK_BUCKETS.every((bucket) => distribution[bucket] >= MIN_PLAYABLE_ROUNDS_PER_RANK);
    const guessEloMessage = hasBalancedGuessRounds
      ? undefined
      : hasPlayableGuessRounds
        ? `Collected ${guessEloRounds.length}/${sampleSize} verified Guess the Elo rounds this request; target is ${roundsPerRank} per rank bucket and current distribution is ${formatRankDistribution(distribution)}.`
        : `Could not collect a playable Guess the Elo set from Riot Match-V5. Needed at least ${MIN_PLAYABLE_ROUNDS_PER_RANK} per rank bucket; got ${formatRankDistribution(distribution)}.`;
    const dodgeQueueMessage =
      orderedDodgeQueueRounds.length > 0
        ? undefined
        : "Could not collect any verified ranked lobbies from Riot Match-V5 with one Smite jungler per team, complete lane assignments, summoner spells, bans, and match outcome.";
    const championMatchupMessage =
      championMatchupRounds.length > 0
        ? undefined
        : `Champion Matchup needs ${MIN_MATCHUP_SAMPLE_GAMES}+ Riot Match-V5 ranked games containing both champions in their selected lanes in the same match.`;
    const value: VerifiedMatchChallengeSet = {
      guessEloRounds: hasPlayableGuessRounds ? guessEloRounds : [],
      dodgeQueueRounds: orderedDodgeQueueRounds,
      championMatchupRounds,
      championWinrateSamples,
      status: hasPlayableGuessRounds || orderedDodgeQueueRounds.length > 0 || championMatchupRounds.length > 0 ? "ready" : "unavailable",
      message: guessEloMessage ?? dodgeQueueMessage ?? championMatchupMessage,
      ...(guessEloMessage ? { guessEloMessage } : {}),
      ...(dodgeQueueMessage ? { dodgeQueueMessage } : {}),
      ...(championMatchupMessage ? { championMatchupMessage } : {})
    };
    const valueToPersist = persistedVerifiedSet ? mergeVerifiedChallengeSets(persistedVerifiedSet, value) : value;

    if (hasVerifiedBuildSamples || hasBuildWinrateSamplesRecord(valueToPersist.championWinrateSamples)) {
      await persistVerifiedMatchCache(persistedCacheKey, valueToPersist);
      cachedMatchSet = {
        key: cacheKey,
        expiresAt: Date.now() + 1000 * 60 * 60 * 2,
        value: valueToPersist
      };

      return valueToPersist;
    }

    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Riot API match fetch failed.";
    return {
      guessEloRounds: [],
      dodgeQueueRounds: [],
      championMatchupRounds: [],
      championWinrateSamples: {},
      status: "unavailable",
      message
    };
  }
}

export async function warmChampionMatchupSampleCache({
  date,
  dataDragonVersion,
  publicChampions,
  batchKey,
  currentPatchMatchTarget = 12,
  sourceCountPerBucket = 1,
  matchHistoryPagesPerSource = 1,
  timeBudgetMs = 22000
}: {
  date: string;
  dataDragonVersion: string;
  publicChampions: PublicChampion[];
  batchKey: string;
  currentPatchMatchTarget?: number;
  sourceCountPerBucket?: number;
  matchHistoryPagesPerSource?: number;
  timeBudgetMs?: number;
}): Promise<ChampionMatchupWarmResult> {
  const currentPatchPrefix = patchPrefixFromVersion(dataDragonVersion);
  const requestedCurrentPatchMatches = Math.max(1, Math.min(80, currentPatchMatchTarget));
  const boundedSourceCount = Math.max(1, Math.min(8, sourceCountPerBucket));
  const boundedHistoryPages = Math.max(1, Math.min(MAX_MATCH_HISTORY_PAGES_PER_SOURCE, matchHistoryPagesPerSource));

  if (!isRiotApiConfigured()) {
    return {
      status: "unconfigured",
      message: "RIOT_API_KEY is required to warm Champion Matchup samples.",
      patchPrefix: currentPatchPrefix,
      batchKey,
      requestedCurrentPatchMatches,
      sourcesChecked: 0,
      matchIdsChecked: 0,
      riotMatchesFetched: 0,
      currentPatchMatches: 0,
      insertedRowsAttempted: 0,
      validTwentyGamePairs: 0
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: "unconfigured",
      message: "DATABASE_URL is required to persist Champion Matchup samples.",
      patchPrefix: currentPatchPrefix,
      batchKey,
      requestedCurrentPatchMatches,
      sourcesChecked: 0,
      matchIdsChecked: 0,
      riotMatchesFetched: 0,
      currentPatchMatches: 0,
      insertedRowsAttempted: 0,
      validTwentyGamePairs: 0
    };
  }

  const startedAt = Date.now();
  const platform = normalizePlatform(env.riotRegion);
  const regional = regionalRouteForPlatform(platform);
  const championLookup = createChampionLookup(publicChampions);
  const championMatchupSamples = new Map<string, ChampionMatchupAccumulator>();
  const matchupSampleRecords: ChampionMatchupSampleRecord[] = [];
  const seenMatches = new Set<string>();
  let sourcesChecked = 0;
  let matchIdsChecked = 0;
  let riotMatchesFetched = 0;
  let currentPatchMatches = 0;
  let insertedRowsAttempted = 0;

  const flush = async (force = false) => {
    if (matchupSampleRecords.length < 200 && !force) {
      return;
    }

    const records = matchupSampleRecords.splice(0, matchupSampleRecords.length);
    insertedRowsAttempted += uniqueMatchupSampleRecords(records).length;
    await persistChampionMatchupSamples(records);
  };

  try {
    const sources = await getRankedSources(platform, `${date}:matchup-warm:${batchKey}`, boundedSourceCount);
    const orderedSources = seededOrder(sources, `${date}:matchup-warm:sources:${batchKey}`);

    for (let page = 0; page < boundedHistoryPages; page += 1) {
      for (const source of orderedSources) {
        if (Date.now() - startedAt > timeBudgetMs || currentPatchMatches >= requestedCurrentPatchMatches) {
          break;
        }

        sourcesChecked += 1;
        let matchIds: string[] = [];

        try {
          matchIds = await getRankedMatchIdsForSource(regional, source.puuid, 1, MATCH_IDS_PER_WARM_SOURCE_PASS, page);
        } catch {
          continue;
        }

        for (const matchId of seededOrder(matchIds, `${date}:matchup-warm:matches:${batchKey}:${source.puuid}:${page}`)) {
          if (Date.now() - startedAt > timeBudgetMs || currentPatchMatches >= requestedCurrentPatchMatches) {
            break;
          }

          if (seenMatches.has(matchId)) {
            continue;
          }

          seenMatches.add(matchId);
          matchIdsChecked += 1;

          try {
            const match = await riotFetch<RiotMatchDto>(regional, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
            riotMatchesFetched += 1;

            if (!isRankedClassicSummonersRiftMatch(match)) {
              continue;
            }

            const records = addChampionHeadToHeadSamples(match, platform, championLookup, championMatchupSamples, currentPatchPrefix);

            if (records.length > 0) {
              currentPatchMatches += 1;
              matchupSampleRecords.push(...records);
              await flush();
            }
          } catch {
            continue;
          }
        }
      }
    }

    await flush(true);

    return {
      status: "ready",
      patchPrefix: currentPatchPrefix,
      batchKey,
      requestedCurrentPatchMatches,
      sourcesChecked,
      matchIdsChecked,
      riotMatchesFetched,
      currentPatchMatches,
      insertedRowsAttempted,
      validTwentyGamePairs: await countPersistedTwentyGameMatchupPairs(currentPatchPrefix)
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Champion Matchup cache warm failed.",
      patchPrefix: currentPatchPrefix,
      batchKey,
      requestedCurrentPatchMatches,
      sourcesChecked,
      matchIdsChecked,
      riotMatchesFetched,
      currentPatchMatches,
      insertedRowsAttempted,
      validTwentyGamePairs: await countPersistedTwentyGameMatchupPairs(currentPatchPrefix)
    };
  }
}

function addChampionWinrateSamples(
  match: RiotMatchDto,
  championLookup: Map<number, PublicChampion>,
  championWinrates: Map<string, WinrateAccumulator>
) {
  const winningTeams = new Map(match.info.teams.map((team) => [team.teamId, team.win]));
  const enemyChampionIdsByTeam = new Map<TeamId, string[]>();

  for (const teamId of [100, 200] as const) {
    enemyChampionIdsByTeam.set(
      teamId,
      match.info.participants
        .filter((participant) => participant.teamId !== teamId)
        .map((participant) => championLookup.get(participant.championId)?.id)
        .filter(Boolean) as string[]
    );
  }

  for (const participant of match.info.participants) {
    const champion = championLookup.get(participant.championId);

    if (!champion) {
      continue;
    }

    const current = championWinrates.get(champion.id) ?? {
      championName: champion.name,
      wins: 0,
      games: 0,
      matchIds: new Set<string>(),
      gamesWithItems: []
    };
    const itemIds = participantItemIds(participant);

    current.games += 1;
    current.wins += winningTeams.get(participant.teamId) ? 1 : 0;
    current.matchIds.add(match.metadata.matchId);
    current.gamesWithItems.push({
      win: Boolean(winningTeams.get(participant.teamId)),
      matchId: match.metadata.matchId,
      itemIds,
      enemyChampionIds: enemyChampionIdsByTeam.get(participant.teamId) ?? []
    });
    championWinrates.set(champion.id, current);
  }
}

function addChampionHeadToHeadSamples(
  match: RiotMatchDto,
  platform: string,
  championLookup: Map<number, PublicChampion>,
  championMatchupSamples: Map<string, ChampionMatchupAccumulator>,
  currentPatchPrefix: string
) {
  if (!isCurrentPatchMatch(match, currentPatchPrefix)) {
    return [];
  }

  const winningTeams = new Map(match.info.teams.map((team) => [team.teamId, team.win]));
  const records: ChampionMatchupSampleRecord[] = [];
  const picks = match.info.participants
    .filter((participant) => isRiotPosition(participant.teamPosition))
    .map((participant): ChampionLanePick | null => {
      const champion = championLookup.get(participant.championId);

      if (!champion || !isRiotPosition(participant.teamPosition)) {
        return null;
      }

      return {
        champion,
        position: participant.teamPosition,
        role: toLaneLabel(participant.teamPosition),
        teamId: participant.teamId
      };
    })
    .filter((pick): pick is ChampionLanePick => Boolean(pick));
  const blue = picks.filter((pick) => pick.teamId === 100);
  const red = picks.filter((pick) => pick.teamId === 200);

  for (const bluePick of blue) {
    for (const redPick of red) {
      if (bluePick.champion.id === redPick.champion.id) {
        continue;
      }

      addChampionMatchupSample(championMatchupSamples, bluePick, redPick, Boolean(winningTeams.get(bluePick.teamId)), match.metadata.matchId);
      records.push(toChampionMatchupSampleRecord(match, platform, bluePick, redPick, Boolean(winningTeams.get(bluePick.teamId))));
    }
  }

  return records;
}

function addChampionMatchupSample(
  championMatchupSamples: Map<string, ChampionMatchupAccumulator>,
  first: ChampionLanePick,
  second: ChampionLanePick,
  firstWon: boolean,
  matchId: string
) {
  const firstKey = championLaneKey(first);
  const secondKey = championLaneKey(second);
  const shouldSwap = firstKey.localeCompare(secondKey) > 0;
  const left = shouldSwap ? second : first;
  const right = shouldSwap ? first : second;
  const leftWon = shouldSwap ? !firstWon : firstWon;
  const key = `${championLaneKey(left)}:vs:${championLaneKey(right)}`;
  const current = championMatchupSamples.get(key) ?? {
    left,
    right,
    leftWins: 0,
    games: 0,
    matchIds: new Set<string>()
  };

  current.games += 1;
  current.leftWins += leftWon ? 1 : 0;
  current.matchIds.add(matchId);
  championMatchupSamples.set(key, current);
}

function toChampionMatchupSampleRecord(
  match: RiotMatchDto,
  platform: string,
  first: ChampionLanePick,
  second: ChampionLanePick,
  firstWon: boolean
): ChampionMatchupSampleRecord {
  const firstKey = championLaneKey(first);
  const secondKey = championLaneKey(second);
  const shouldSwap = firstKey.localeCompare(secondKey) > 0;
  const left = shouldSwap ? second : first;
  const right = shouldSwap ? first : second;
  const leftWon = shouldSwap ? !firstWon : firstWon;
  const gameCreation = match.info.gameCreation ?? match.info.gameStartTimestamp;

  return {
    matchId: match.metadata.matchId,
    platform,
    gameVersion: match.info.gameVersion,
    ...(gameCreation ? { gameCreation } : {}),
    leftChampionId: left.champion.id,
    leftRole: left.role,
    rightChampionId: right.champion.id,
    rightRole: right.role,
    leftWon
  };
}

function championLaneKey(pick: Pick<ChampionLanePick, "champion" | "position">) {
  return `${pick.position}:${pick.champion.id}`;
}

function toChampionMatchupRounds(championMatchupSamples: Map<string, ChampionMatchupAccumulator>, date: string) {
  return toChampionMatchupRoundsForThreshold(
    championMatchupSamples,
    date,
    MIN_MATCHUP_SAMPLE_GAMES,
    "Riot Match-V5 ranked solo head-to-head champion-lane sample"
  );
}

function toChampionMatchupRoundsForThreshold(
  championMatchupSamples: Map<string, ChampionMatchupAccumulator>,
  date: string,
  minimumGames: number,
  dataSource: string
) {
  const pairCandidates = [...championMatchupSamples.entries()]
    .map(([key, sample]) => ({ key, sample }))
    .filter(({ sample }) => sample.games >= minimumGames && sample.leftWins !== sample.games - sample.leftWins)
    .sort((a, b) => seededOrderKey(`${date}:champion-matchup:${minimumGames}:${a.key}`) - seededOrderKey(`${date}:champion-matchup:${minimumGames}:${b.key}`));

  return pairCandidates.slice(0, 96).map(({ key, sample }, index): ChampionMatchupRound => {
    const leftWinRate = toWinRate(sample.leftWins, sample.games);
    const rightWinRate = Math.round((100 - leftWinRate) * 10) / 10;
    const leftPick = toMatchupPick(sample.left.champion, sample.left.role, sample.leftWins, sample.games, sample.matchIds.size, leftWinRate);
    const rightPick = toMatchupPick(sample.right.champion, sample.right.role, sample.games - sample.leftWins, sample.games, sample.matchIds.size, rightWinRate);
    const shouldFlip = hashString(`${date}:champion-matchup:flip:${key}`) % 2 === 0;
    const displayLeft = shouldFlip ? rightPick : leftPick;
    const displayRight = shouldFlip ? leftPick : rightPick;

    return {
      id: `${date}:champion-matchup:${index}:${normalize(displayLeft.role)}:${displayLeft.champion.id}:vs:${normalize(displayRight.role)}:${displayRight.champion.id}`,
      date,
      left: displayLeft,
      right: displayRight,
      answerSide: displayLeft.winRate > displayRight.winRate ? "left" : "right",
      dataSource
    };
  });
}

function isAnalysisComplete(
  seenMatchCount: number,
  currentPatchMatchupMatchCount: number,
  requestedBuildSampleSize: number,
  requestedMatchupSampleSize: number,
  needsLiveMatchupRounds: boolean,
  championWinrates: Map<string, WinrateAccumulator>,
  championMatchupSamples: Map<string, ChampionMatchupAccumulator>
) {
  return (
    seenMatchCount >= requestedBuildSampleSize &&
    hasBuildWinrateCandidate(championWinrates) &&
    (!needsLiveMatchupRounds ||
      eligibleChampionMatchupRoundCount(championMatchupSamples) >= TARGET_MATCHUP_ROUNDS ||
      currentPatchMatchupMatchCount >= requestedMatchupSampleSize)
  );
}

function hasBuildWinrateCandidate(championWinrates: Map<string, WinrateAccumulator>) {
  return [...championWinrates.values()].some((sample) => sample.games >= MIN_BUILD_SAMPLE_GAMES);
}

function hasBuildWinrateSamplesRecord(samples: Record<string, BuildWinrateStats>) {
  return Object.values(samples).some(
    (sample) =>
      sample.games >= MIN_BUILD_SAMPLE_GAMES &&
      (sample.inventorySamples ?? []).some((game) => (game.enemyChampionIds?.length ?? 0) >= 5)
  );
}

function eligibleChampionMatchupRoundCount(championMatchupSamples: Map<string, ChampionMatchupAccumulator>) {
  return [...championMatchupSamples.values()].filter(
    (sample) => sample.games >= MIN_MATCHUP_SAMPLE_GAMES && sample.leftWins !== sample.games - sample.leftWins
  ).length;
}

function toMatchupPick(champion: PublicChampion, role: string, wins: number, games: number, sampleMatches: number, winRate = toWinRate(wins, games)) {
  return {
    champion,
    role,
    wins,
    games,
    winRate,
    sampleMatches
  };
}

async function persistChampionMatchupSamples(records: ChampionMatchupSampleRecord[]) {
  if (!isDatabaseConfigured() || records.length === 0) {
    return;
  }

  const uniqueRecords = uniqueMatchupSampleRecords(records);

  try {
    await ensureChampionMatchupSampleTable();
    await query(
      `insert into champion_matchup_samples (
        match_id,
        platform,
        game_version,
        game_creation,
        left_champion_id,
        left_role,
        right_champion_id,
        right_role,
        left_won
      )
      select *
      from unnest(
        $1::text[],
        $2::text[],
        $3::text[],
        $4::timestamptz[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::text[],
        $9::boolean[]
      )
      on conflict (match_id, left_champion_id, left_role, right_champion_id, right_role)
      do nothing`,
      [
        uniqueRecords.map((record) => record.matchId),
        uniqueRecords.map((record) => record.platform),
        uniqueRecords.map((record) => record.gameVersion),
        uniqueRecords.map((record) => (record.gameCreation ? new Date(record.gameCreation).toISOString() : null)),
        uniqueRecords.map((record) => record.leftChampionId),
        uniqueRecords.map((record) => record.leftRole),
        uniqueRecords.map((record) => record.rightChampionId),
        uniqueRecords.map((record) => record.rightRole),
        uniqueRecords.map((record) => record.leftWon)
      ]
    );
  } catch {
    // The app can still use live Riot samples when the optional Supabase cache table has not been migrated yet.
  }
}

function uniqueMatchupSampleRecords(records: ChampionMatchupSampleRecord[]) {
  const seen = new Set<string>();
  const uniqueRecords: ChampionMatchupSampleRecord[] = [];

  for (const record of records) {
    const key = `${record.matchId}:${record.leftChampionId}:${record.leftRole}:${record.rightChampionId}:${record.rightRole}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniqueRecords.push(record);
    }
  }

  return uniqueRecords;
}

async function getPersistedChampionMatchupRounds(date: string, publicChampions: PublicChampion[], currentPatchPrefix: string) {
  if (!isDatabaseConfigured()) {
    return [];
  }

  try {
    await ensureChampionMatchupSampleTable();
    const strictResult = await query<PersistedMatchupAggregateRow>(
      `select
        left_champion_id,
        left_role,
        right_champion_id,
        right_role,
        count(*)::int as games,
        sum(case when left_won then 1 else 0 end)::int as left_wins,
        count(distinct match_id)::int as sample_matches
      from champion_matchup_samples
      where game_version like $2
      group by left_champion_id, left_role, right_champion_id, right_role
      having count(*) >= $1
        and sum(case when left_won then 1 else 0 end) <> count(*) - sum(case when left_won then 1 else 0 end)`,
      [MIN_MATCHUP_SAMPLE_GAMES, `${currentPatchPrefix}%`]
    );
    const strictRounds = toPersistedChampionMatchupRounds(
      strictResult.rows,
      publicChampions,
      date,
      MIN_MATCHUP_SAMPLE_GAMES,
      `Supabase cached Riot Match-V5 ${currentPatchPrefix} head-to-head champion-lane sample`
    );

    if (strictRounds.length > 0) {
      return strictRounds;
    }

    return [];
  } catch {
    return [];
  }
}

function mergePersistedMatchupsIntoVerifiedSet(cachedSet: VerifiedMatchChallengeSet, championMatchupRounds: ChampionMatchupRound[]) {
  const championMatchupMessage =
    championMatchupRounds.length > 0
      ? undefined
      : `Champion Matchup needs ${MIN_MATCHUP_SAMPLE_GAMES}+ Riot Match-V5 ranked games containing both champions in their selected lanes in the same match.`;

  return {
    ...cachedSet,
    championMatchupRounds,
    status: cachedSet.guessEloRounds.length > 0 || cachedSet.dodgeQueueRounds.length > 0 || championMatchupRounds.length > 0 ? "ready" as const : "unavailable" as const,
    ...(championMatchupMessage ? { championMatchupMessage } : { championMatchupMessage: undefined })
  };
}

function mergeVerifiedChallengeSets(existing: VerifiedMatchChallengeSet, incoming: VerifiedMatchChallengeSet): VerifiedMatchChallengeSet {
  const guessEloRounds = mergeRoundsByMatch(existing.guessEloRounds, incoming.guessEloRounds).slice(0, 200);
  const dodgeQueueRounds = mergeRoundsByMatch(existing.dodgeQueueRounds, incoming.dodgeQueueRounds).slice(0, 200);
  const championWinrateSamples = mergeChampionWinrateSamples(existing.championWinrateSamples, incoming.championWinrateSamples);
  const championMatchupRounds = incoming.championMatchupRounds.length > 0 ? incoming.championMatchupRounds : existing.championMatchupRounds;

  return {
    ...incoming,
    guessEloRounds,
    dodgeQueueRounds,
    championMatchupRounds,
    championWinrateSamples,
    status: guessEloRounds.length > 0 || dodgeQueueRounds.length > 0 || championMatchupRounds.length > 0 ? "ready" : incoming.status,
    message: incoming.message ?? existing.message,
    guessEloMessage: incoming.guessEloMessage ?? existing.guessEloMessage,
    dodgeQueueMessage: incoming.dodgeQueueMessage ?? existing.dodgeQueueMessage,
    championMatchupMessage: incoming.championMatchupMessage ?? existing.championMatchupMessage
  };
}

function mergeRoundsByMatch<T extends { id: string; sourceMatch?: { matchId: string } }>(existing: T[], incoming: T[]) {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const round of [...incoming, ...existing]) {
    const key = round.sourceMatch?.matchId ?? round.id;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(round);
    }
  }

  return merged;
}

function mergeChampionWinrateSamples(existing: Record<string, BuildWinrateStats>, incoming: Record<string, BuildWinrateStats>) {
  const championIds = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const merged: Record<string, BuildWinrateStats> = {};

  for (const championId of championIds) {
    const existingStats = existing[championId];
    const incomingStats = incoming[championId];
    const championName = incomingStats?.championName ?? existingStats?.championName ?? championId;
    const samplesByMatch = new Map<string, NonNullable<BuildWinrateStats["inventorySamples"]>[number]>();

    for (const sample of [...(existingStats?.inventorySamples ?? []), ...(incomingStats?.inventorySamples ?? [])]) {
      samplesByMatch.set(sample.matchId, sample);
    }

    const inventorySamples = [...samplesByMatch.values()];

    if (inventorySamples.length === 0) {
      merged[championId] = incomingStats ?? existingStats;
      continue;
    }

    const wins = inventorySamples.filter((sample) => sample.win).length;
    const games = inventorySamples.length;

    merged[championId] = {
      championId,
      championName,
      wins,
      games,
      winRate: toWinRate(wins, games),
      sampleMatches: samplesByMatch.size,
      inventorySamples,
      source: "Riot Match-V5 ranked solo sample"
    };
  }

  return merged;
}

async function getPersistedVerifiedMatchCache(cacheKey: string) {
  if (!isDatabaseConfigured()) {
    return null;
  }

  try {
    await ensureVerifiedMatchCacheTable();
    const result = await query<VerifiedMatchCacheRow>(
      `select payload
      from verified_match_cache
      where cache_key = $1
        and expires_at > now()
      limit 1`,
      [cacheKey]
    );

    return result.rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

async function persistVerifiedMatchCache(cacheKey: string, value: VerifiedMatchChallengeSet) {
  if (!isDatabaseConfigured()) {
    return;
  }

  try {
    await ensureVerifiedMatchCacheTable();
    await query(
      `insert into verified_match_cache (cache_key, payload, expires_at)
      values ($1, $2::jsonb, now() + interval '24 hours')
      on conflict (cache_key)
      do update set
        payload = excluded.payload,
        expires_at = excluded.expires_at,
        created_at = now()`,
      [cacheKey, JSON.stringify(value)]
    );
  } catch {
    // Live Riot data remains available even if the optional shared cache cannot be written.
  }
}

async function ensureVerifiedMatchCacheTable() {
  if (!isDatabaseConfigured()) {
    return;
  }

  verifiedMatchCacheTableReady ??= (async () => {
    await query(`create table if not exists verified_match_cache (
      cache_key text primary key,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )`);
    await query("create index if not exists verified_match_cache_expires_idx on verified_match_cache (expires_at desc)");
  })().catch((error) => {
    verifiedMatchCacheTableReady = null;
    throw error;
  });

  await verifiedMatchCacheTableReady;
}

async function countPersistedTwentyGameMatchupPairs(currentPatchPrefix: string) {
  if (!isDatabaseConfigured()) {
    return 0;
  }

  try {
    await ensureChampionMatchupSampleTable();
    const result = await query<{ pairs: string | number }>(
      `select count(*)::int as pairs
      from (
        select
          left_champion_id,
          left_role,
          right_champion_id,
          right_role
        from champion_matchup_samples
        where game_version like $2
        group by left_champion_id, left_role, right_champion_id, right_role
        having count(*) >= $1
          and sum(case when left_won then 1 else 0 end) <> count(*) - sum(case when left_won then 1 else 0 end)
      ) valid_pairs`,
      [MIN_MATCHUP_SAMPLE_GAMES, `${currentPatchPrefix}%`]
    );

    return Number(result.rows[0]?.pairs ?? 0);
  } catch {
    return 0;
  }
}

async function ensureChampionMatchupSampleTable() {
  if (!isDatabaseConfigured()) {
    return;
  }

  matchupSampleTableReady ??= (async () => {
    await query(`create table if not exists champion_matchup_samples (
      match_id text not null,
      platform text not null,
      game_version text not null,
      game_creation timestamptz,
      left_champion_id text not null,
      left_role text not null,
      right_champion_id text not null,
      right_role text not null,
      left_won boolean not null,
      created_at timestamptz not null default now(),
      primary key (match_id, left_champion_id, left_role, right_champion_id, right_role)
    )`);
    await query(
      "create index if not exists champion_matchup_samples_pair_idx on champion_matchup_samples (left_champion_id, left_role, right_champion_id, right_role)"
    );
    await query("create index if not exists champion_matchup_samples_version_pair_idx on champion_matchup_samples (game_version, left_champion_id, left_role, right_champion_id, right_role)");
    await query("create index if not exists champion_matchup_samples_created_idx on champion_matchup_samples (created_at desc)");
  })().catch((error) => {
    matchupSampleTableReady = null;
    throw error;
  });

  await matchupSampleTableReady;
}

function toPersistedChampionMatchupRounds(
  rows: PersistedMatchupAggregateRow[],
  publicChampions: PublicChampion[],
  date: string,
  minimumGames: number,
  dataSource: string
) {
  const championLookup = new Map(publicChampions.map((champion) => [champion.id, champion]));

  return rows
    .map((row) => {
      const leftChampion = championLookup.get(row.left_champion_id);
      const rightChampion = championLookup.get(row.right_champion_id);
      const games = Number(row.games);
      const leftWins = Number(row.left_wins);
      const sampleMatches = Number(row.sample_matches);

      if (!leftChampion || !rightChampion || !Number.isFinite(games) || !Number.isFinite(leftWins) || games < minimumGames) {
        return null;
      }

      const leftWinRate = toWinRate(leftWins, games);
      const rightWinRate = Math.round((100 - leftWinRate) * 10) / 10;
      const leftPick = toMatchupPick(leftChampion, row.left_role, leftWins, games, sampleMatches, leftWinRate);
      const rightPick = toMatchupPick(rightChampion, row.right_role, games - leftWins, games, sampleMatches, rightWinRate);
      const key = `${row.left_role}:${row.left_champion_id}:vs:${row.right_role}:${row.right_champion_id}`;
      const shouldFlip = hashString(`${date}:persisted-champion-matchup:flip:${key}`) % 2 === 0;
      const displayLeft = shouldFlip ? rightPick : leftPick;
      const displayRight = shouldFlip ? leftPick : rightPick;

      return {
        id: `${date}:champion-matchup:persisted:${normalize(displayLeft.role)}:${displayLeft.champion.id}:vs:${normalize(displayRight.role)}:${displayRight.champion.id}`,
        date,
        left: displayLeft,
        right: displayRight,
        answerSide: displayLeft.winRate > displayRight.winRate ? "left" as const : "right" as const,
        dataSource
      };
    })
    .filter((round): round is ChampionMatchupRound => Boolean(round))
    .sort((a, b) => seededOrderKey(`${date}:persisted-champion-matchup:${minimumGames}:${matchupRoundKey(a)}`) - seededOrderKey(`${date}:persisted-champion-matchup:${minimumGames}:${matchupRoundKey(b)}`))
    .slice(0, 96);
}

function mergeChampionMatchupRounds(primary: ChampionMatchupRound[], secondary: ChampionMatchupRound[]) {
  const seen = new Set<string>();
  const rounds: ChampionMatchupRound[] = [];

  for (const round of [...primary, ...secondary]) {
    const key = matchupRoundKey(round);

    if (!seen.has(key)) {
      seen.add(key);
      rounds.push(round);
    }
  }

  return rounds.slice(0, 96);
}

function matchupRoundKey(round: ChampionMatchupRound) {
  return [round.left, round.right]
    .map((pick) => `${pick.role}:${pick.champion.id}`)
    .sort()
    .join(":vs:");
}

function toWinRate(wins: number, games: number) {
  return Math.round((wins / games) * 1000) / 10;
}

function toChampionWinrateSamples(championWinrates: Map<string, WinrateAccumulator>) {
  return Object.fromEntries(
    [...championWinrates.entries()].map(([championId, stats]) => [
      championId,
      {
        championId,
        championName: stats.championName,
        wins: stats.wins,
        games: stats.games,
        winRate: Math.round((stats.wins / stats.games) * 1000) / 10,
        sampleMatches: stats.matchIds.size,
        inventorySamples: stats.gamesWithItems,
        source: "Riot Match-V5 ranked solo sample"
      }
    ])
  );
}

function participantItemIds(participant: RiotParticipantDto) {
  return unique([
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
    participant.item6
  ]
    .filter((id) => id > 0)
    .map((id) => String(id)));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function createEmptyRankBucketMap() {
  return new Map<RankBucket, GuessEloRound[]>(RANK_BUCKETS.map((bucket) => [bucket, []]));
}

function groupSourcesByBucket(sources: RankedSource[]) {
  const grouped = new Map<RankBucket, RankedSource[]>(RANK_BUCKETS.map((bucket) => [bucket, []]));

  for (const source of sources) {
    grouped.get(source.bucket)?.push(source);
  }

  return grouped;
}

function interleaveRankedSources(sourcesByBucket: Map<RankBucket, RankedSource[]>, seed: string) {
  const orderedByBucket = new Map(
    RANK_BUCKETS.map((bucket) => [bucket, seededOrder(sourcesByBucket.get(bucket) ?? [], `${seed}:${bucket}`)])
  );
  const maxLength = Math.max(...RANK_BUCKETS.map((bucket) => orderedByBucket.get(bucket)?.length ?? 0));
  const sources: RankedSource[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    for (const bucket of RANK_BUCKETS) {
      const source = orderedByBucket.get(bucket)?.[index];

      if (source) {
        sources.push(source);
      }
    }
  }

  return sources;
}

function nextBalancedRankBucketLimit(roundsByBucket: Map<RankBucket, GuessEloRound[]>, initialRoundsPerRank: number, roundsPerRank: number) {
  const lowestBucketCount = Math.min(...RANK_BUCKETS.map((bucket) => roundsByBucket.get(bucket)?.length ?? 0));

  return Math.min(roundsPerRank, Math.max(initialRoundsPerRank, lowestBucketCount) + 1);
}

function interleaveRankBuckets(roundsByBucket: Map<RankBucket, GuessEloRound[]>, roundsPerRank: number) {
  const rounds: GuessEloRound[] = [];

  for (let index = 0; index < roundsPerRank; index += 1) {
    for (const bucket of RANK_BUCKETS) {
      const round = roundsByBucket.get(bucket)?.[index];

      if (round) {
        rounds.push(round);
      }
    }
  }

  return rounds;
}

function orderRoundsWithoutConsecutivePlayers<T extends { id: string }>(rounds: T[], seed: string, getPlayers: (round: T) => string[]) {
  const remaining = [...rounds].sort((a, b) => hashString(`${seed}:${a.id}`) - hashString(`${seed}:${b.id}`));
  const ordered: T[] = [];

  while (remaining.length > 0) {
    const previousPlayers = new Set(normalizePlayerNames(ordered.at(-1) ? getPlayers(ordered[ordered.length - 1]) : []));
    const playerFrequency = playerFrequencies(remaining, getPlayers);
    const candidates = remaining.map((round, index) => {
      const players = normalizePlayerNames(getPlayers(round));
      const overlapCount = players.filter((player) => previousPlayers.has(player)).length;
      const pressure = players.reduce((max, player) => Math.max(max, playerFrequency.get(player) ?? 0), 0);

      return { index, overlapCount, pressure };
    });
    const best = candidates
      .sort((a, b) => a.overlapCount - b.overlapCount || b.pressure - a.pressure || a.index - b.index)[0];
    const pickedIndex = best?.index ?? 0;
    const [next] = remaining.splice(pickedIndex, 1);

    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

function normalizePlayerNames(players: string[]) {
  return players.map((player) => player.trim().toLowerCase()).filter(Boolean);
}

function playerFrequencies<T>(rounds: T[], getPlayers: (round: T) => string[]) {
  const frequencies = new Map<string, number>();

  for (const round of rounds) {
    for (const player of new Set(normalizePlayerNames(getPlayers(round)))) {
      frequencies.set(player, (frequencies.get(player) ?? 0) + 1);
    }
  }

  return frequencies;
}

function guessEloRoundPlayers(round: GuessEloRound) {
  return [
    round.sourceMatch?.sourcePlayer,
    ...round.lanes.map((lane) => lane.playerName),
    ...round.enemyLanes.map((lane) => lane.playerName)
  ].filter((player): player is string => Boolean(player));
}

function dodgeQueueRoundPlayers(round: DodgeQueueRound) {
  return [
    round.sourceMatch?.sourcePlayer,
    ...(round.allyPlayerNames ?? []),
    ...(round.enemyPlayerNames ?? [])
  ].filter((player): player is string => Boolean(player));
}

function rankDistribution(rounds: GuessEloRound[]) {
  const distribution = Object.fromEntries(RANK_BUCKETS.map((bucket) => [bucket, 0])) as Record<RankBucket, number>;

  for (const round of rounds) {
    if (isRankBucket(round.answerTier)) {
      distribution[round.answerTier] += 1;
    }
  }

  return distribution;
}

function formatRankDistribution(distribution: Record<RankBucket, number>) {
  return RANK_BUCKETS.map((bucket) => `${bucket}: ${distribution[bucket]}`).join(", ");
}

async function getRankedMatchIdsForSource(regional: string, puuid: string, pages: number, count = MATCH_IDS_PER_REQUEST, startPage = 0) {
  const ids: string[] = [];
  const boundedCount = Math.max(1, Math.min(MATCH_IDS_PER_REQUEST, count));

  for (let page = 0; page < pages; page += 1) {
    const pageStart = (startPage + page) * boundedCount;
    const pageIds = await riotFetch<string[]>(
      regional,
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=${pageStart}&count=${boundedCount}`
    );

    ids.push(...pageIds);

    if (pageIds.length < boundedCount) {
      break;
    }
  }

  return unique(ids);
}

function isRankBucket(value: string): value is RankBucket {
  return (RANK_BUCKETS as readonly string[]).includes(value);
}

function isRankedClassicSummonersRiftMatch(match: RiotMatchDto) {
  return (
    match.info.queueId === RANKED_SOLO_QUEUE_ID &&
    match.info.mapId === SUMMONERS_RIFT_MAP_ID &&
    match.info.gameMode === CLASSIC_GAME_MODE &&
    match.info.participants.length === 10
  );
}

async function getRankedSources(platform: string, seed: string, sourceCountPerBucket: number): Promise<RankedSource[]> {
  const sourcePlans: Array<{
    bucket: RankBucket;
    queuePlans?: Array<{ tier: string; division: string }>;
    apexLeaguePaths?: string[];
  }> = [
    { bucket: "Iron/Bronze", queuePlans: [{ tier: "BRONZE", division: "I" }] },
    { bucket: "Silver/Gold", queuePlans: [{ tier: "GOLD", division: "II" }] },
    {
      bucket: "Platinum/Emerald",
      queuePlans: [
        { tier: "PLATINUM", division: "I" },
        { tier: "EMERALD", division: "II" }
      ]
    },
    {
      bucket: "Diamond/Master",
      queuePlans: [{ tier: "DIAMOND", division: "II" }],
      apexLeaguePaths: ["/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5"]
    },
    {
      bucket: "Grandmaster/Challenger",
      apexLeaguePaths: [
        "/lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5",
        "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5"
      ]
    }
  ];
  const sources: RankedSource[] = [];

  for (const plan of sourcePlans) {
    const candidates: RankedEntryCandidate[] = [];

    for (const queuePlan of plan.queuePlans ?? []) {
      try {
        candidates.push(...await getLeagueEntryPageCandidates(platform, queuePlan.tier, queuePlan.division));
      } catch {
        continue;
      }
    }

    for (const path of plan.apexLeaguePaths ?? []) {
      try {
        candidates.push(...await getApexLeagueEntryCandidates(platform, path));
      } catch {
        continue;
      }
    }

    for (const candidate of seededOrder(candidates, `${seed}:${plan.bucket}`).slice(0, sourceCountPerBucket)) {
      let puuid: string | null = null;

      try {
        puuid = await resolveEntryPuuid(platform, candidate.entry);
      } catch {
        continue;
      }

      if (puuid) {
        sources.push({
          puuid,
          bucket: plan.bucket,
          tier: `${candidate.tier} ${candidate.entry.rank ?? candidate.division ?? ""}`.trim()
        });
      }
    }
  }

  return seededOrder(sources, `${seed}:ranked-sources`);
}

async function getLeagueEntryPageCandidates(platform: string, tier: string, division: string) {
  const candidates: RankedEntryCandidate[] = [];

  for (let page = 1; page <= LEAGUE_ENTRY_PAGES_PER_BUCKET; page += 1) {
    const pageEntries = await riotFetch<RiotLeagueEntry[]>(
      platform,
      `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`
    );

    candidates.push(...pageEntries.map((entry) => ({ entry, tier: entry.tier ?? tier, division: entry.rank ?? division })));

    if (pageEntries.length === 0) {
      break;
    }
  }

  const seen = new Set<string>();
  const uniqueCandidates: RankedEntryCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.entry.puuid ?? candidate.entry.summonerId;

    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

async function getApexLeagueEntryCandidates(platform: string, path: string) {
  const list = await riotFetch<RiotLeagueList>(platform, path);
  const tier = list.tier ?? path.match(/\/([^/]+)leagues\//)?.[1]?.toUpperCase() ?? "MASTER";

  return (list.entries ?? []).map((entry) => ({ entry, tier }));
}

async function resolveEntryPuuid(platform: string, entry: RiotLeagueEntry) {
  if (entry.puuid) {
    return entry.puuid;
  }

  if (!entry.summonerId) {
    return null;
  }

  const summoner = await riotFetch<RiotSummonerDto>(platform, `/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`);
  return summoner.puuid;
}

function toVerifiedRounds(
  match: RiotMatchDto,
  source: RankedSource,
  platform: string,
  championLookup: Map<number, PublicChampion>,
  spellLookup: Map<number, SummonerSpellRef>,
  date: string
) {
  if (
    match.info.queueId !== RANKED_SOLO_QUEUE_ID ||
    match.info.mapId !== SUMMONERS_RIFT_MAP_ID ||
    match.info.gameMode !== CLASSIC_GAME_MODE ||
    match.info.participants.length !== 10
  ) {
    return null;
  }

  if (!hasVerifiedSmiteAndPositions(match.info.participants)) {
    return null;
  }

  const blue = toLanePicks(match.info.participants, 100, championLookup, spellLookup);
  const red = toLanePicks(match.info.participants, 200, championLookup, spellLookup);

  if (!blue || !red) {
    return null;
  }

  const sourceParticipant = match.info.participants.find((participant) => participant.puuid === source.puuid);
  const allyTeamId: TeamId = sourceParticipant?.teamId === 200 ? 200 : 100;
  const enemyTeamId: TeamId = allyTeamId === 100 ? 200 : 100;
  const allyPicks = allyTeamId === 100 ? blue : red;
  const enemyPicks = enemyTeamId === 100 ? blue : red;
  const allyTeam = match.info.teams.find((team) => team.teamId === allyTeamId);
  const allyTeamWon = Boolean(allyTeam?.win);
  const sourcePlayer = formatRiotId(sourceParticipant);
  const gameCreation = match.info.gameCreation ?? match.info.gameStartTimestamp;
  const gameId = match.info.gameId ?? gameIdFromMatchId(match.metadata.matchId);
  const matchData = toVerifiedMatchData(match, championLookup, spellLookup);
  const sourceMatch = {
    matchId: match.metadata.matchId,
    ...(gameId ? { gameId } : {}),
    gameVersion: match.info.gameVersion,
    ...(gameCreation ? { gameCreation } : {}),
    queueId: match.info.queueId,
    platform,
    ...(sourcePlayer ? { sourcePlayer } : {}),
    ...(matchData ? { matchData } : {})
  };
  const dataSource = "Riot Match-V5 teamPosition + summoner IDs, mapped through Riot Data Dragon summoner.json";

  const guessElo: GuessEloRound = {
    id: `${date}:guess-elo:${match.metadata.matchId}`,
    date,
    lanes: blue,
    enemyLanes: red,
    options: [...RANK_BUCKETS],
    answerTier: source.bucket,
    signalNotes: [
      `Source player official ranked tier: ${source.tier}.`,
      `Lane labels come from Match-V5 teamPosition in match ${match.metadata.matchId}.`,
      "Summoner spell IDs come from Match-V5 summoner1Id/summoner2Id and are mapped to Data Dragon spell assets."
    ],
    dataSource,
    sourceMatch
  };

  const dodgeQueue: DodgeQueueRound = {
    id: `${date}:dodge-queue:${match.metadata.matchId}:${allyTeamId}`,
    date,
    allyTeam: allyPicks.map((pick) => pick.champion),
    enemyTeam: enemyPicks.map((pick) => pick.champion),
    allySpells: allyPicks.map((pick) => pick.spells),
    enemySpells: enemyPicks.map((pick) => pick.spells),
    allyPlayerNames: allyPicks.map((pick) => pick.playerName ?? ""),
    enemyPlayerNames: enemyPicks.map((pick) => pick.playerName ?? ""),
    allyBans: bansForTeam(match, allyTeamId, championLookup),
    enemyBans: bansForTeam(match, enemyTeamId, championLookup),
    answer: allyTeamWon ? "queue" : "dodge",
    explanation: allyTeamWon
      ? `Verified match outcome: the displayed ally side queued and won ${match.metadata.matchId}.`
      : `Verified match outcome: the displayed ally side queued and lost ${match.metadata.matchId}.`,
    sourceMatch: {
      ...sourceMatch,
      allyTeamWon
    }
  };

  return { guessElo, dodgeQueue };
}

function toLanePicks(
  participants: RiotParticipantDto[],
  teamId: TeamId,
  championLookup: Map<number, PublicChampion>,
  spellLookup: Map<number, SummonerSpellRef>
) {
  const team = participants.filter((participant) => participant.teamId === teamId);
  const picks = POSITION_ORDER.map((position) => {
    const participant = team.find((candidate) => candidate.teamPosition === position);
    const champion = participant ? championLookup.get(participant.championId) : undefined;
    const firstSpell = participant ? spellLookup.get(participant.summoner1Id) : undefined;
    const secondSpell = participant ? spellLookup.get(participant.summoner2Id) : undefined;
    const playerName = participant ? formatRiotId(participant) : undefined;

    if (!participant || !champion || !firstSpell || !secondSpell) {
      return null;
    }

    return {
      role: toLaneLabel(position),
      champion,
      spells: [firstSpell, secondSpell],
      ...(playerName ? { playerName } : {})
    };
  });

  return picks.every(Boolean) ? (picks as NonNullable<(typeof picks)[number]>[]) : null;
}

function hasVerifiedSmiteAndPositions(participants: RiotParticipantDto[]) {
  for (const teamId of TEAM_IDS) {
    const team = participants.filter((participant) => participant.teamId === teamId);

    if (team.length !== 5) {
      return false;
    }

    for (const position of POSITION_ORDER) {
      if (team.filter((participant) => participant.teamPosition === position).length !== 1) {
        return false;
      }
    }

    const smiteUsers = team.filter((participant) => participant.summoner1Id === SMITE_ID || participant.summoner2Id === SMITE_ID);

    if (smiteUsers.length !== 1 || smiteUsers[0].teamPosition !== "JUNGLE") {
      return false;
    }
  }

  return true;
}

function bansForTeam(match: RiotMatchDto, teamId: TeamId, championLookup: Map<number, PublicChampion>) {
  return (match.info.teams.find((team) => team.teamId === teamId)?.bans ?? [])
    .filter((ban) => ban.championId > 0)
    .sort((a, b) => a.pickTurn - b.pickTurn)
    .map((ban) => championLookup.get(ban.championId))
    .filter(Boolean) as PublicChampion[];
}

function toVerifiedMatchData(
  match: RiotMatchDto,
  championLookup: Map<number, PublicChampion>,
  spellLookup: Map<number, SummonerSpellRef>
): VerifiedMatchData | undefined {
  const itemVersion = dataDragonVersionFromGameVersion(match.info.gameVersion);
  const teams = TEAM_IDS.map((teamId) => {
    const team = match.info.teams.find((candidate) => candidate.teamId === teamId);
    const participants = POSITION_ORDER.map((position) => {
      const participant = match.info.participants.find((candidate) => candidate.teamId === teamId && candidate.teamPosition === position);
      const champion = participant ? championLookup.get(participant.championId) : undefined;
      const firstSpell = participant ? spellLookup.get(participant.summoner1Id) : undefined;
      const secondSpell = participant ? spellLookup.get(participant.summoner2Id) : undefined;

      if (!participant || !champion || !firstSpell || !secondSpell) {
        return null;
      }

      return {
        role: toLaneLabel(position),
        ...(formatRiotId(participant) ? { playerName: formatRiotId(participant) } : {}),
        champion,
        spells: [firstSpell, secondSpell],
        items: participantItemSlotIds(participant).map((id) => ({
          id,
          imageUrl: `https://ddragon.leagueoflegends.com/cdn/${itemVersion}/img/item/${id}.png`
        })),
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
        gold: participant.goldEarned,
        damageToChampions: participant.totalDamageDealtToChampions,
        visionScore: participant.visionScore,
        championLevel: participant.champLevel
      };
    });

    if (!team || participants.some((participant) => !participant)) {
      return null;
    }

    return {
      teamId,
      name: teamId === 100 ? "Blue Team" : "Red Team",
      win: team.win,
      bans: bansForTeam(match, teamId, championLookup),
      participants: participants as NonNullable<(typeof participants)[number]>[]
    };
  });

  if (teams.some((team) => !team)) {
    return undefined;
  }

  return {
    ...(match.info.gameDuration ? { gameDurationSeconds: match.info.gameDuration } : {}),
    gameMode: match.info.gameMode,
    queueId: match.info.queueId,
    mapId: match.info.mapId,
    teams: teams as VerifiedMatchData["teams"]
  };
}

function participantItemSlotIds(participant: RiotParticipantDto) {
  return [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
    participant.item6
  ]
    .filter((id) => id > 0)
    .map((id) => String(id));
}

function dataDragonVersionFromGameVersion(gameVersion: string) {
  const [major, minor] = gameVersion.split(".");

  return major && minor ? `${major}.${minor}.1` : gameVersion;
}

function patchPrefixFromVersion(version: string) {
  const [major, minor] = version.split(".");

  return major && minor ? `${major}.${minor}.` : version;
}

function isCurrentPatchMatch(match: RiotMatchDto, currentPatchPrefix: string) {
  return match.info.gameVersion.startsWith(currentPatchPrefix);
}

function formatRiotId(participant?: RiotParticipantDto) {
  if (!participant?.riotIdGameName) {
    return participant?.summonerName;
  }

  return participant.riotIdTagline ? `${participant.riotIdGameName}#${participant.riotIdTagline}` : participant.riotIdGameName;
}

function gameIdFromMatchId(matchId: string) {
  const rawGameId = matchId.split("_").at(-1);
  const gameId = rawGameId ? Number(rawGameId) : NaN;

  return Number.isFinite(gameId) ? gameId : undefined;
}

function createChampionLookup(publicChampions: PublicChampion[]) {
  return new Map(
    publicChampions
      .filter((champion): champion is PublicChampion & { key: number } => typeof champion.key === "number")
      .map((champion) => [champion.key, champion])
  );
}

async function riotFetch<T>(route: string, path: string): Promise<T> {
  const host = route.includes(".") ? route : `${route}.api.riotgames.com`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForRiotRequestSlot();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RIOT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`https://${host}${path}`, {
        headers: {
          "X-Riot-Token": env.riotApiKey
        },
        next: { revalidate: 60 * 60 * 2 },
        signal: controller.signal
      });

      if (response.status === 429) {
        const retryAfterMs = boundedRetryAfterMs(response, attempt);
        nextRiotRequestAt = Math.max(nextRiotRequestAt, Date.now() + retryAfterMs);

        if (attempt < 2 && retryAfterMs <= RIOT_MAX_RETRY_AFTER_MS) {
          await sleep(retryAfterMs);
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`Riot API ${path} failed with ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt < 2 && isRetryableRiotFetchError(error)) {
        await sleep(RIOT_MIN_REQUEST_INTERVAL_MS * (attempt + 2));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Riot API ${path} failed after retries`);
}

function isRetryableRiotFetchError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function waitForRiotRequestSlot() {
  const waitMs = Math.max(0, nextRiotRequestAt - Date.now());

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  nextRiotRequestAt = Math.max(nextRiotRequestAt, Date.now() + RIOT_MIN_REQUEST_INTERVAL_MS);
}

function boundedRetryAfterMs(response: Response, attempt: number) {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 700 * (attempt + 1) ** 2;

  return Math.min(Math.max(retryAfterMs, RIOT_MIN_REQUEST_INTERVAL_MS), RIOT_MAX_RETRY_AFTER_MS);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePlatform(value: string) {
  return value.trim().toLowerCase() || "na1";
}

function regionalRouteForPlatform(platform: string) {
  if (["br1", "la1", "la2", "na1", "oc1"].includes(platform)) return "americas.api.riotgames.com";
  if (["eun1", "euw1", "tr1", "ru"].includes(platform)) return "europe.api.riotgames.com";
  if (["jp1", "kr"].includes(platform)) return "asia.api.riotgames.com";
  return "sea.api.riotgames.com";
}

function toLaneLabel(position: RiotPosition) {
  if (position === "TOP") return "Top";
  if (position === "JUNGLE") return "Jungle";
  if (position === "MIDDLE") return "Mid";
  if (position === "BOTTOM") return "Bot";
  return "Supp";
}

function isRiotPosition(value: string): value is RiotPosition {
  return (POSITION_ORDER as readonly string[]).includes(value);
}

function seededOrder<T>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return hashString(`${seed}:${aKey}`) - hashString(`${seed}:${bKey}`);
  });
}

function seededOrderKey(value: string) {
  return hashString(value);
}

function normalize(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
