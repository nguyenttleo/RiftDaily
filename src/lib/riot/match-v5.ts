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
const SMITE_ID = 11;
const TEAM_IDS = [100, 200] as const;
const POSITION_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const RANK_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Emerald/Diamond", "Master+"] as const;
const MIN_MATCHUP_SAMPLE_GAMES = 20;
const TARGET_MATCHUP_ROUNDS = 16;
const MATCH_IDS_PER_REQUEST = 100;
const LEAGUE_ENTRY_PAGES_PER_BUCKET = 3;
const MAX_MATCH_HISTORY_PAGES_PER_SOURCE = 5;
const MAX_CURRENT_PATCH_MATCHUP_SAMPLE_SIZE = 20000;
const MAX_ANALYSIS_MATCH_FETCH_BUDGET = 40000;
const MAX_SOURCES_PER_RANK_BUCKET = 48;

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

let cachedMatchSet: {
  key: string;
  expiresAt: number;
  value: VerifiedMatchChallengeSet;
} | null = null;
let matchupSampleTableReady: Promise<void> | null = null;

export async function getVerifiedRankedMatchChallenges({
  date,
  dataDragonVersion,
  publicChampions,
  summonerSpells,
  allowLiveMatchupCollection = false
}: {
  date: string;
  dataDragonVersion: string;
  publicChampions: PublicChampion[];
  summonerSpells: SummonerSpellRef[];
  allowLiveMatchupCollection?: boolean;
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
  const requestedSampleSize = Number.isFinite(env.riotMatchSampleSize) ? Math.max(4, Math.min(32, env.riotMatchSampleSize)) : 16;
  const roundsPerRank = Math.max(1, Math.floor(requestedSampleSize / RANK_BUCKETS.length));
  const sampleSize = roundsPerRank * RANK_BUCKETS.length;
  const requestedBuildSampleSize = Number.isFinite(env.riotBuildSampleMatchCount) ? Math.max(sampleSize, Math.min(128, env.riotBuildSampleMatchCount)) : 128;
  const requestedMatchupSampleSize = Number.isFinite(env.riotMatchupSampleMatchCount)
    ? Math.max(sampleSize, Math.min(MAX_CURRENT_PATCH_MATCHUP_SAMPLE_SIZE, env.riotMatchupSampleMatchCount))
    : 1600;
  const matchHistoryPagesPerSource = Number.isFinite(env.riotMatchHistoryPagesPerSource)
    ? Math.max(1, Math.min(MAX_MATCH_HISTORY_PAGES_PER_SOURCE, env.riotMatchHistoryPagesPerSource))
    : 2;
  const currentPatchPrefix = patchPrefixFromVersion(dataDragonVersion);
  const championLookup = createChampionLookup(publicChampions);
  const persistedChampionMatchupRounds = await getPersistedChampionMatchupRounds(date, publicChampions, currentPatchPrefix);
  const shouldCollectLiveMatchups = allowLiveMatchupCollection && persistedChampionMatchupRounds.length < TARGET_MATCHUP_ROUNDS;
  const analysisTargetMatchCount = Math.max(requestedBuildSampleSize, shouldCollectLiveMatchups ? requestedMatchupSampleSize : sampleSize);
  const analysisFetchBudget = shouldCollectLiveMatchups
    ? Math.min(MAX_ANALYSIS_MATCH_FETCH_BUDGET, Math.max(analysisTargetMatchCount, requestedMatchupSampleSize * 3))
    : analysisTargetMatchCount;
  const matchIdsPerSourceBudget = MATCH_IDS_PER_REQUEST * (shouldCollectLiveMatchups ? matchHistoryPagesPerSource : 1);
  const analysisMatchesPerRank = Math.max(roundsPerRank, Math.ceil(analysisFetchBudget / RANK_BUCKETS.length));
  const sourceCountPerBucket = Math.min(MAX_SOURCES_PER_RANK_BUCKET, Math.max(4, Math.ceil(analysisMatchesPerRank / matchIdsPerSourceBudget) + 1));
  const cacheKey = `${date}:${platform}:${currentPatchPrefix}:${sampleSize}:${analysisFetchBudget}:${sourceCountPerBucket}:${matchHistoryPagesPerSource}:${persistedChampionMatchupRounds.length}`;

  if (cachedMatchSet?.key === cacheKey && cachedMatchSet.expiresAt > Date.now()) {
    return cachedMatchSet.value;
  }

  try {
    const sources = await getRankedSources(platform, date, sourceCountPerBucket);
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
      const bucketRounds = guessRoundsByBucket.get(bucket) ?? [];
      const bucketSources = sourcesByBucket.get(bucket) ?? [];

      for (const source of bucketSources) {
        if (bucketRounds.length >= roundsPerRank) {
          break;
        }

        let matchIds: string[] = [];

        try {
          matchIds = await getRankedMatchIdsForSource(regional, source.puuid, 1);
        } catch {
          continue;
        }

        for (const matchId of seededOrder(matchIds, `${date}:${source.bucket}:${source.puuid}`)) {
          if (bucketRounds.length >= roundsPerRank) {
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

            const usedForPuzzleRound = bucketRounds.length < roundsPerRank;

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

    for (const source of seededOrder(sources, `${date}:analysis-sources`)) {
      if (
        isAnalysisComplete(
          seenMatches.size,
          currentPatchMatchupMatchIds.size,
          requestedBuildSampleSize,
          requestedMatchupSampleSize,
          shouldCollectLiveMatchups,
          championMatchupSamples
        ) ||
        seenMatches.size >= analysisFetchBudget
      ) {
        break;
      }

      let matchIds: string[] = [];

      try {
        matchIds = await getRankedMatchIdsForSource(regional, source.puuid, matchHistoryPagesPerSource);
      } catch {
        continue;
      }

      for (const matchId of seededOrder(matchIds, `${date}:analysis:${source.bucket}:${source.puuid}`)) {
        if (
          isAnalysisComplete(
            seenMatches.size,
            currentPatchMatchupMatchIds.size,
            requestedBuildSampleSize,
            requestedMatchupSampleSize,
            shouldCollectLiveMatchups,
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
    const liveChampionMatchupRounds = toChampionMatchupRounds(championMatchupSamples, date);
    const refreshedPersistedChampionMatchupRounds = await getPersistedChampionMatchupRounds(date, publicChampions, currentPatchPrefix);
    const championMatchupRounds = mergeChampionMatchupRounds(refreshedPersistedChampionMatchupRounds, liveChampionMatchupRounds);
    const hasBalancedGuessRounds =
      guessEloRounds.length === sampleSize &&
      RANK_BUCKETS.every((bucket) => distribution[bucket] === roundsPerRank);
    const guessEloMessage = hasBalancedGuessRounds
      ? undefined
      : `Could not collect a balanced Guess the Elo set from Riot Match-V5. Needed ${roundsPerRank} per rank bucket; got ${formatRankDistribution(distribution)}.`;
    const dodgeQueueMessage =
      orderedDodgeQueueRounds.length > 0
        ? undefined
        : "Could not collect any verified ranked lobbies from Riot Match-V5 with one Smite jungler per team, complete lane assignments, summoner spells, bans, and match outcome.";
    const championMatchupMessage =
      championMatchupRounds.length > 0
        ? undefined
        : `Champion Matchup needs ${MIN_MATCHUP_SAMPLE_GAMES}+ Riot Match-V5 ranked games containing both champions in their selected lanes in the same match.`;
    const value: VerifiedMatchChallengeSet = {
      guessEloRounds: hasBalancedGuessRounds ? guessEloRounds : [],
      dodgeQueueRounds: orderedDodgeQueueRounds,
      championMatchupRounds,
      championWinrateSamples,
      status: hasBalancedGuessRounds || orderedDodgeQueueRounds.length > 0 || championMatchupRounds.length > 0 ? "ready" : "unavailable",
      message: guessEloMessage ?? dodgeQueueMessage ?? championMatchupMessage,
      ...(guessEloMessage ? { guessEloMessage } : {}),
      ...(dodgeQueueMessage ? { dodgeQueueMessage } : {}),
      ...(championMatchupMessage ? { championMatchupMessage } : {})
    };

    cachedMatchSet = {
      key: cacheKey,
      expiresAt: Date.now() + 1000 * 60 * 60 * 2,
      value
    };

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

    for (const source of seededOrder(sources, `${date}:matchup-warm:sources:${batchKey}`)) {
      if (Date.now() - startedAt > timeBudgetMs || currentPatchMatches >= requestedCurrentPatchMatches) {
        break;
      }

      sourcesChecked += 1;
      let matchIds: string[] = [];

      try {
        matchIds = await getRankedMatchIdsForSource(regional, source.puuid, boundedHistoryPages);
      } catch {
        continue;
      }

      for (const matchId of seededOrder(matchIds, `${date}:matchup-warm:matches:${batchKey}:${source.puuid}`)) {
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
      itemIds
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
  championMatchupSamples: Map<string, ChampionMatchupAccumulator>
) {
  return (
    seenMatchCount >= requestedBuildSampleSize &&
    (!needsLiveMatchupRounds ||
      eligibleChampionMatchupRoundCount(championMatchupSamples) >= TARGET_MATCHUP_ROUNDS ||
      currentPatchMatchupMatchCount >= requestedMatchupSampleSize)
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

async function getRankedMatchIdsForSource(regional: string, puuid: string, pages: number) {
  const ids: string[] = [];

  for (let page = 0; page < pages; page += 1) {
    const pageIds = await riotFetch<string[]>(
      regional,
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=${page * MATCH_IDS_PER_REQUEST}&count=${MATCH_IDS_PER_REQUEST}`
    );

    ids.push(...pageIds);

    if (pageIds.length < MATCH_IDS_PER_REQUEST) {
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
    match.info.mapId === 11 &&
    match.info.gameMode === "CLASSIC" &&
    match.info.participants.length === 10
  );
}

async function getRankedSources(platform: string, seed: string, sourceCountPerBucket: number): Promise<RankedSource[]> {
  const sourcePlans = [
    { bucket: "Iron/Bronze", tier: "BRONZE", division: "I" },
    { bucket: "Silver/Gold", tier: "GOLD", division: "II" },
    { bucket: "Emerald/Diamond", tier: "EMERALD", division: "II" }
  ];
  const sources: RankedSource[] = [];

  for (const plan of sourcePlans) {
    const entries = await getLeagueEntryPageCandidates(platform, plan.tier, plan.division);

    for (const entry of seededOrder(entries, `${seed}:${plan.bucket}`).slice(0, sourceCountPerBucket)) {
      const puuid = await resolveEntryPuuid(platform, entry);

      if (puuid) {
        sources.push({ puuid, bucket: plan.bucket as RankBucket, tier: `${plan.tier} ${entry.rank ?? plan.division}` });
      }
    }
  }

  const master = await riotFetch<RiotLeagueList>(platform, "/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5");

  for (const entry of seededOrder(master.entries ?? [], `${seed}:Master+`).slice(0, sourceCountPerBucket)) {
    const puuid = await resolveEntryPuuid(platform, entry);

    if (puuid) {
      sources.push({ puuid, bucket: "Master+", tier: `${master.tier ?? "MASTER"} ${entry.rank ?? ""}`.trim() });
    }
  }

  return seededOrder(sources, `${seed}:ranked-sources`);
}

async function getLeagueEntryPageCandidates(platform: string, tier: string, division: string) {
  const entries: RiotLeagueEntry[] = [];

  for (let page = 1; page <= LEAGUE_ENTRY_PAGES_PER_BUCKET; page += 1) {
    const pageEntries = await riotFetch<RiotLeagueEntry[]>(
      platform,
      `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`
    );

    entries.push(...pageEntries);

    if (pageEntries.length === 0) {
      break;
    }
  }

  const seen = new Set<string>();
  const uniqueEntries: RiotLeagueEntry[] = [];

  for (const entry of entries) {
    const key = entry.puuid ?? entry.summonerId;

    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueEntries.push(entry);
    }
  }

  return uniqueEntries;
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
    match.info.mapId !== 11 ||
    match.info.gameMode !== "CLASSIC" ||
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
    options: ["Iron/Bronze", "Silver/Gold", "Emerald/Diamond", "Master+"],
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
  const response = await fetch(`https://${host}${path}`, {
    headers: {
      "X-Riot-Token": env.riotApiKey
    },
    next: { revalidate: 60 * 60 * 2 }
  });

  if (!response.ok) {
    throw new Error(`Riot API ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
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
