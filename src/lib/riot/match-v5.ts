import { env, isRiotApiConfigured } from "@/lib/env";
import type {
  BuildWinrateStats,
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
  championWinrateSamples: Record<string, BuildWinrateStats>;
  status: "ready" | "unconfigured" | "unavailable";
  message?: string;
}

interface WinrateAccumulator {
  championName: string;
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
  const cacheKey = `${date}:${platform}:${sampleSize}`;

  if (cachedMatchSet?.key === cacheKey && cachedMatchSet.expiresAt > Date.now()) {
    return cachedMatchSet.value;
  }

  try {
    const sources = await getRankedSources(platform, date);
    const sourcesByBucket = groupSourcesByBucket(sources);
    const championLookup = createChampionLookup(publicChampions);
    const spellLookup = new Map(summonerSpells.map((spell) => [spell.id, spell]));
    const seenMatches = new Set<string>();
    const guessRoundsByBucket = createEmptyRankBucketMap();
    const dodgeQueueRounds: DodgeQueueRound[] = [];
    const championWinrates = new Map<string, WinrateAccumulator>();

    for (const bucket of RANK_BUCKETS) {
      const bucketRounds = guessRoundsByBucket.get(bucket) ?? [];
      const bucketSources = sourcesByBucket.get(bucket) ?? [];

      for (const source of bucketSources) {
        if (bucketRounds.length >= roundsPerRank) {
          break;
        }

        let matchIds: string[] = [];

        try {
          matchIds = await riotFetch<string[]>(
            regional,
            `/lol/match/v5/matches/by-puuid/${encodeURIComponent(source.puuid)}/ids?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=0&count=10`
          );
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
            const verified = toVerifiedRounds(match, source, platform, championLookup, spellLookup, date);

            if (!verified) {
              continue;
            }

            addChampionWinrateSamples(match, championLookup, championWinrates);
            bucketRounds.push(verified.guessElo);

            if (dodgeQueueRounds.length < sampleSize) {
              dodgeQueueRounds.push(verified.dodgeQueue);
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
    const hasBalancedGuessRounds =
      guessEloRounds.length === sampleSize &&
      RANK_BUCKETS.every((bucket) => distribution[bucket] === roundsPerRank);
    const value: VerifiedMatchChallengeSet =
      hasBalancedGuessRounds && dodgeQueueRounds.length > 0
        ? { guessEloRounds, dodgeQueueRounds, championWinrateSamples, status: "ready" }
        : {
            guessEloRounds: [],
            dodgeQueueRounds: [],
            championWinrateSamples: {},
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
      matchIds: new Set<string>()
    };

    current.games += 1;
    current.wins += winningTeams.get(participant.teamId) ? 1 : 0;
    current.matchIds.add(match.metadata.matchId);
    championWinrates.set(champion.id, current);
  }
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
        source: "Riot Match-V5 ranked solo sample"
      }
    ])
  );
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

async function getRankedSources(platform: string, seed: string): Promise<RankedSource[]> {
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

    for (const entry of seededOrder(entries, `${seed}:${plan.bucket}`).slice(0, 8)) {
      const puuid = await resolveEntryPuuid(platform, entry);

      if (puuid) {
        sources.push({ puuid, bucket: plan.bucket as RankBucket, tier: `${plan.tier} ${entry.rank ?? plan.division}` });
      }
    }
  }

  const master = await riotFetch<RiotLeagueList>(platform, "/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5");

  for (const entry of seededOrder(master.entries ?? [], `${seed}:Master+`).slice(0, 8)) {
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

function seededOrder<T>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return hashString(`${seed}:${aKey}`) - hashString(`${seed}:${bKey}`);
  });
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
