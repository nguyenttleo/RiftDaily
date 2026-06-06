import { env, isRiotApiConfigured } from "@/lib/env";
import type {
  BuildWinrateStats,
  ChampionMatchupRound,
  DodgeQueueRound,
  GuessEloRound,
  PublicChampion,
  SummonerSpellRef
} from "@/types";

const RANKED_SOLO_QUEUE_ID = 420;
const SMITE_ID = 11;
const TEAM_IDS = [100, 200] as const;
const POSITION_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const RANK_BUCKETS = ["Iron/Bronze", "Silver/Gold", "Emerald/Diamond", "Master+"] as const;
const MIN_MATCHUP_SAMPLE_GAMES = 20;
const MATCH_IDS_PER_SOURCE = 20;
const MAX_ANALYSIS_MATCH_SAMPLE_SIZE = 512;
const MAX_SOURCES_PER_RANK_BUCKET = 12;

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

interface ChampionLaneAccumulator {
  champion: PublicChampion;
  role: string;
  wins: number;
  games: number;
  matchIds: Set<string>;
}

let cachedMatchSet: {
  key: string;
  expiresAt: number;
  value: VerifiedMatchChallengeSet;
} | null = null;

export async function getVerifiedRankedMatchChallenges({
  date,
  publicChampions,
  summonerSpells
}: {
  date: string;
  publicChampions: PublicChampion[];
  summonerSpells: SummonerSpellRef[];
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
  const requestedMatchupSampleSize = Number.isFinite(env.riotMatchupSampleMatchCount) ? Math.max(sampleSize, Math.min(MAX_ANALYSIS_MATCH_SAMPLE_SIZE, env.riotMatchupSampleMatchCount)) : MAX_ANALYSIS_MATCH_SAMPLE_SIZE;
  const analysisSampleSize = Math.max(requestedBuildSampleSize, requestedMatchupSampleSize);
  const analysisMatchesPerRank = Math.max(roundsPerRank, Math.ceil(analysisSampleSize / RANK_BUCKETS.length));
  const sourceCountPerBucket = Math.min(MAX_SOURCES_PER_RANK_BUCKET, Math.max(4, Math.ceil(analysisMatchesPerRank / MATCH_IDS_PER_SOURCE) + 1));
  const cacheKey = `${date}:${platform}:${sampleSize}:${analysisMatchesPerRank}:${sourceCountPerBucket}`;

  if (cachedMatchSet?.key === cacheKey && cachedMatchSet.expiresAt > Date.now()) {
    return cachedMatchSet.value;
  }

  try {
    const sources = await getRankedSources(platform, date, sourceCountPerBucket);
    const sourcesByBucket = groupSourcesByBucket(sources);
    const championLookup = createChampionLookup(publicChampions);
    const spellLookup = new Map(summonerSpells.map((spell) => [spell.id, spell]));
    const seenMatches = new Set<string>();
    const guessRoundsByBucket = createEmptyRankBucketMap();
    const buildMatchesByBucket = createEmptyRankCountMap();
    const dodgeQueueRounds: DodgeQueueRound[] = [];
    const championWinrates = new Map<string, WinrateAccumulator>();
    const championLaneSamples = new Map<string, ChampionLaneAccumulator>();

    for (const bucket of RANK_BUCKETS) {
      const bucketRounds = guessRoundsByBucket.get(bucket) ?? [];
      const bucketSources = sourcesByBucket.get(bucket) ?? [];

      for (const source of bucketSources) {
        if (bucketRounds.length >= roundsPerRank && (buildMatchesByBucket.get(bucket) ?? 0) >= analysisMatchesPerRank) {
          break;
        }

        let matchIds: string[] = [];

        try {
          matchIds = await riotFetch<string[]>(
            regional,
            `/lol/match/v5/matches/by-puuid/${encodeURIComponent(source.puuid)}/ids?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=0&count=${MATCH_IDS_PER_SOURCE}`
          );
        } catch {
          continue;
        }

        for (const matchId of seededOrder(matchIds, `${date}:${source.bucket}:${source.puuid}`)) {
          if (bucketRounds.length >= roundsPerRank && (buildMatchesByBucket.get(bucket) ?? 0) >= analysisMatchesPerRank) {
            break;
          }

          if (seenMatches.has(matchId)) {
            continue;
          }

          seenMatches.add(matchId);

          try {
            const match = await riotFetch<RiotMatchDto>(regional, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
            const verified = toVerifiedRounds(match, source, platform, championLookup, spellLookup, date);

            if (!verified) {
              continue;
            }

            const usedForPuzzleRound = bucketRounds.length < roundsPerRank;

            addChampionWinrateSamples(match, championLookup, championWinrates);
            addChampionLaneWinrateSamples(match, championLookup, championLaneSamples);
            buildMatchesByBucket.set(bucket, (buildMatchesByBucket.get(bucket) ?? 0) + 1);

            if (usedForPuzzleRound) {
              bucketRounds.push(verified.guessElo);

              if (dodgeQueueRounds.length < sampleSize) {
                dodgeQueueRounds.push(verified.dodgeQueue);
              }
            }
          } catch {
            continue;
          }
        }
      }
    }

    const guessEloRounds = interleaveRankBuckets(guessRoundsByBucket, roundsPerRank);
    const distribution = rankDistribution(guessEloRounds);
    const championWinrateSamples = toChampionWinrateSamples(championWinrates);
    const championMatchupRounds = toChampionMatchupRounds(championLaneSamples, date);
    const hasBalancedGuessRounds =
      guessEloRounds.length === sampleSize &&
      RANK_BUCKETS.every((bucket) => distribution[bucket] === roundsPerRank);
    const value: VerifiedMatchChallengeSet =
      hasBalancedGuessRounds && dodgeQueueRounds.length > 0
        ? { guessEloRounds, dodgeQueueRounds, championMatchupRounds, championWinrateSamples, status: "ready" }
        : {
            guessEloRounds: [],
            dodgeQueueRounds: [],
            championMatchupRounds,
            championWinrateSamples,
            status: "unavailable",
            message: `Could not collect a balanced Guess the Elo set from Riot Match-V5. Needed ${roundsPerRank} per rank bucket; got ${formatRankDistribution(distribution)}.`
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

function addChampionLaneWinrateSamples(
  match: RiotMatchDto,
  championLookup: Map<number, PublicChampion>,
  championLaneSamples: Map<string, ChampionLaneAccumulator>
) {
  const winningTeams = new Map(match.info.teams.map((team) => [team.teamId, team.win]));

  for (const participant of match.info.participants) {
    if (!isRiotPosition(participant.teamPosition)) {
      continue;
    }

    const champion = championLookup.get(participant.championId);

    if (!champion) {
      continue;
    }

    const key = `${participant.teamPosition}:${champion.id}`;
    const current = championLaneSamples.get(key) ?? {
      role: toLaneLabel(participant.teamPosition),
      champion,
      wins: 0,
      games: 0,
      matchIds: new Set<string>()
    };

    current.games += 1;
    current.wins += winningTeams.get(participant.teamId) ? 1 : 0;
    current.matchIds.add(match.metadata.matchId);
    championLaneSamples.set(key, current);
  }
}

function toChampionMatchupRounds(championLaneSamples: Map<string, ChampionLaneAccumulator>, date: string) {
  const dataSource = "Riot Match-V5 ranked solo champion-lane winrate sample";
  const samples = [...championLaneSamples.entries()]
    .map(([key, sample]) => ({ key, sample }))
    .filter(({ sample }) => sample.games >= MIN_MATCHUP_SAMPLE_GAMES)
    .sort((a, b) => seededOrderKey(`${date}:champion-lane:${a.key}`) - seededOrderKey(`${date}:champion-lane:${b.key}`));
  const pairCandidates: Array<{
    leftKey: string;
    rightKey: string;
    left: ChampionLaneAccumulator;
    right: ChampionLaneAccumulator;
  }> = [];

  for (let leftIndex = 0; leftIndex < samples.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < samples.length; rightIndex += 1) {
      const left = samples[leftIndex];
      const right = samples[rightIndex];
      const leftWinRate = toWinRate(left.sample.wins, left.sample.games);
      const rightWinRate = toWinRate(right.sample.wins, right.sample.games);

      if (
        left.sample.champion.id === right.sample.champion.id ||
        left.sample.role === right.sample.role ||
        leftWinRate === rightWinRate
      ) {
        continue;
      }

      pairCandidates.push({
        leftKey: left.key,
        rightKey: right.key,
        left: left.sample,
        right: right.sample
      });
    }
  }

  return pairCandidates
    .sort((a, b) => seededOrderKey(`${date}:champion-matchup:${a.leftKey}:${a.rightKey}`) - seededOrderKey(`${date}:champion-matchup:${b.leftKey}:${b.rightKey}`))
    .slice(0, 96)
    .map((pair, index): ChampionMatchupRound => {
      const leftPick = toMatchupPick(pair.left.champion, pair.left.role, pair.left.wins, pair.left.games, pair.left.matchIds.size);
      const rightPick = toMatchupPick(pair.right.champion, pair.right.role, pair.right.wins, pair.right.games, pair.right.matchIds.size);
      const shouldFlip = hashString(`${date}:champion-matchup:flip:${pair.leftKey}:${pair.rightKey}`) % 2 === 0;
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

function toMatchupPick(champion: PublicChampion, role: string, wins: number, games: number, sampleMatches: number) {
  return {
    champion,
    role,
    wins,
    games,
    winRate: toWinRate(wins, games),
    sampleMatches
  };
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

function createEmptyRankCountMap() {
  return new Map<RankBucket, number>(RANK_BUCKETS.map((bucket) => [bucket, 0]));
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

function isRankBucket(value: string): value is RankBucket {
  return (RANK_BUCKETS as readonly string[]).includes(value);
}

async function getRankedSources(platform: string, seed: string, sourceCountPerBucket: number): Promise<RankedSource[]> {
  const sourcePlans = [
    { bucket: "Iron/Bronze", tier: "BRONZE", division: "I" },
    { bucket: "Silver/Gold", tier: "GOLD", division: "II" },
    { bucket: "Emerald/Diamond", tier: "EMERALD", division: "II" }
  ];
  const sources: RankedSource[] = [];

  for (const plan of sourcePlans) {
    const entries = await riotFetch<RiotLeagueEntry[]>(
      platform,
      `/lol/league/v4/entries/RANKED_SOLO_5x5/${plan.tier}/${plan.division}?page=1`
    );

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
  const sourceMatch = {
    matchId: match.metadata.matchId,
    gameVersion: match.info.gameVersion,
    queueId: match.info.queueId,
    platform
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

    if (!participant || !champion || !firstSpell || !secondSpell) {
      return null;
    }

    return {
      role: toLaneLabel(position),
      champion,
      spells: [firstSpell, secondSpell]
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
