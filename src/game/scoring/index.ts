import type { ChallengeType } from "@/types";

export function calculateScore(type: ChallengeType, attemptNumber: number, elapsedMs: number, correct: boolean): number {
  if (!correct) {
    return 0;
  }

  const base = type === "ability" ? 1200 : 1500;
  const attemptPenalty = Math.max(0, attemptNumber - 1) * 120;
  const timePenalty = Math.min(500, Math.floor(elapsedMs / 1000) * 3);

  return Math.max(250, base - attemptPenalty - timePenalty);
}

export interface RankProgressInput {
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  winRate: number;
  perfectSolves: number;
}

export const leagueRankTiers = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Emerald",
  "Diamond",
  "Master",
  "Grandmaster",
  "Challenger"
] as const;

export type LeagueRankTier = (typeof leagueRankTiers)[number];
export type LeagueRankName = LeagueRankTier | "Unranked";
export type LeagueRankDivision = "IV" | "III" | "II" | "I";

export interface LeagueRankState {
  tier: LeagueRankName;
  division: LeagueRankDivision | null;
  lp: number;
  lastLpChange: number | null;
  gamesPlayed: number;
  wins: number;
}

export interface RankedResultInput {
  won: boolean;
  performanceQuality?: number;
}

const rankThresholds = [
  { rank: "Challenger", points: 700 },
  { rank: "Grandmaster", points: 560 },
  { rank: "Master", points: 440 },
  { rank: "Diamond", points: 340 },
  { rank: "Emerald", points: 260 },
  { rank: "Platinum", points: 190 },
  { rank: "Gold", points: 130 },
  { rank: "Silver", points: 80 },
  { rank: "Bronze", points: 45 },
  { rank: "Iron", points: 1 }
] as const;

const divisionTiers = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond"] as const;
const leagueRankDivisions: LeagueRankDivision[] = ["IV", "III", "II", "I"];
const MASTER_PROMOTION_LP = 500;

export function rankPointsFromProgress(progress: RankProgressInput): number {
  if (progress.gamesPlayed <= 0 && progress.maxStreak <= 0) {
    return 0;
  }

  return Math.round(
    progress.currentStreak * 10 +
      progress.maxStreak * 15 +
      progress.winRate * 0.4 +
      Math.min(progress.gamesPlayed, 120) +
      progress.perfectSolves * 3
  );
}

export function rankFromProgress(progress: RankProgressInput): string {
  const points = rankPointsFromProgress(progress);
  return rankThresholds.find((threshold) => points >= threshold.points)?.rank ?? "Unranked";
}

export function createInitialRankState(progress?: RankProgressInput): LeagueRankState {
  if (!progress || progress.gamesPlayed <= 0) {
    return {
      tier: "Unranked",
      division: null,
      lp: 0,
      lastLpChange: null,
      gamesPlayed: 0,
      wins: 0
    };
  }

  const points = rankPointsFromProgress(progress);
  const tier = rankFromProgress(progress) as LeagueRankName;
  const lp = tier === "Unranked" ? 0 : Math.max(0, Math.min(99, points % 100));

  return {
    tier,
    division: hasDivisions(tier) ? "IV" : null,
    lp,
    lastLpChange: null,
    gamesPlayed: progress.gamesPlayed,
    wins: Math.round((progress.winRate / 100) * progress.gamesPlayed)
  };
}

export function calculateLpDelta(result: RankedResultInput): number {
  const quality = normalizePerformanceQuality(result.performanceQuality ?? (result.won ? 0.65 : 0.35));

  if (result.won) {
    return 10 + Math.round(quality * 20);
  }

  return -(10 + Math.round((1 - quality) * 20));
}

export function applyRankedResult(state: LeagueRankState, result: RankedResultInput): LeagueRankState {
  const delta = calculateLpDelta(result);
  const normalizedState = normalizeRankState(state);
  let tier = normalizedState.tier;
  let division = normalizedState.division;
  let lp = normalizedState.lp;

  if (tier === "Unranked") {
    tier = "Iron";
    division = "IV";
    lp = 0;
  }

  lp += delta;

  while (lp >= promotionThreshold(tier)) {
    const promoted = promoteRank(tier, division);

    if (!promoted) {
      break;
    }

    lp -= promotionThreshold(tier);
    tier = promoted.tier;
    division = promoted.division;
  }

  while (lp < 0) {
    const demoted = demoteRank(tier, division);

    if (!demoted) {
      lp = 0;
      break;
    }

    tier = demoted.tier;
    division = demoted.division;
    lp += promotionThreshold(tier);
  }

  if (tier !== "Challenger") {
    lp = Math.min(lp, promotionThreshold(tier) - 1);
  }

  return {
    tier,
    division,
    lp: Math.max(0, Math.round(lp)),
    lastLpChange: delta,
    gamesPlayed: normalizedState.gamesPlayed + 1,
    wins: normalizedState.wins + (result.won ? 1 : 0)
  };
}

export function normalizeRankState(
  state: (Partial<Omit<LeagueRankState, "tier" | "division">> & { tier?: string | null; division?: string | null }) | null | undefined
): LeagueRankState {
  const tier = normalizeRankName(state?.tier ?? undefined);
  const division = normalizeRankDivision(state?.division, tier);
  const cap = promotionThreshold(tier);
  const lp = Math.round(Number(state?.lp ?? 0));

  return {
    tier,
    division,
    lp: tier === "Challenger" ? Math.max(0, lp) : Math.max(0, Math.min(cap - 1, lp)),
    lastLpChange: typeof state?.lastLpChange === "number" ? Math.max(-30, Math.min(30, Math.round(state.lastLpChange))) : null,
    gamesPlayed: Math.max(0, Math.round(Number(state?.gamesPlayed ?? 0))),
    wins: Math.max(0, Math.round(Number(state?.wins ?? 0)))
  };
}

export function parseLeagueRankState(raw: string | null): LeagueRankState | null {
  if (!raw) {
    return null;
  }

  try {
    return normalizeRankState(JSON.parse(raw) as Partial<LeagueRankState>);
  } catch {
    return null;
  }
}

export function rankedStorageKey(username: string): string {
  return `rift-daily:ranked:${username.replace(/[^a-z0-9]/gi, "").toLowerCase() || "guest"}`;
}

export function rankProgressFromState(state: LeagueRankState): {
  points: number;
  lp: number;
  lastLpChange: number | null;
  nextRank: string | null;
  nextPoints: number | null;
  percent: number;
} {
  const normalized = normalizeRankState(state);

  if (normalized.tier === "Unranked") {
    return {
      points: 0,
      lp: 0,
      lastLpChange: normalized.lastLpChange,
      nextRank: "Iron IV",
      nextPoints: 0,
      percent: 0
    };
  }

  const next = promoteRank(normalized.tier, normalized.division);
  const threshold = promotionThreshold(normalized.tier);

  return {
    points: normalized.lp,
    lp: normalized.lp,
    lastLpChange: normalized.lastLpChange,
    nextRank: next ? displayRankName(next) : null,
    nextPoints: next ? threshold : null,
    percent: next ? Math.max(0, Math.min(100, Math.round((normalized.lp / threshold) * 100))) : 100
  };
}

export function nextRankProgress(progress: RankProgressInput | LeagueRankState): ReturnType<typeof rankProgressFromState> {
  if ("lp" in progress && "tier" in progress) {
    return rankProgressFromState(progress);
  }

  return rankProgressFromState(createInitialRankState(progress));
}

export function rankFromStats(currentStreak: number, winRate: number): string {
  return rankFromProgress({
    currentStreak,
    maxStreak: currentStreak,
    gamesPlayed: currentStreak > 0 ? currentStreak : 0,
    winRate,
    perfectSolves: 0
  });
}

export function displayRankName(state: Pick<LeagueRankState, "tier" | "division">): string {
  if (state.tier === "Unranked") {
    return "Unranked";
  }

  return hasDivisions(state.tier) ? `${state.tier} ${state.division ?? "IV"}` : state.tier;
}

function normalizePerformanceQuality(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeRankName(value?: string): LeagueRankName {
  const base = value?.split(" ")[0];

  if (value === "Unranked") {
    return value;
  }

  return leagueRankTiers.find((tier) => tier === base) ?? "Unranked";
}

function normalizeRankDivision(value: string | null | undefined, tier: LeagueRankName): LeagueRankDivision | null {
  if (!hasDivisions(tier)) {
    return null;
  }

  if (value && leagueRankDivisions.includes(value as LeagueRankDivision)) {
    return value as LeagueRankDivision;
  }

  return "IV";
}

function hasDivisions(tier: LeagueRankName): tier is (typeof divisionTiers)[number] {
  return divisionTiers.some((divisionTier) => divisionTier === tier);
}

function promotionThreshold(tier: LeagueRankName): number {
  if (tier === "Master" || tier === "Grandmaster") {
    return MASTER_PROMOTION_LP;
  }

  if (tier === "Challenger") {
    return Number.POSITIVE_INFINITY;
  }

  return 100;
}

function promoteRank(tier: LeagueRankName, division: LeagueRankDivision | null): Pick<LeagueRankState, "tier" | "division"> | null {
  if (tier === "Unranked") {
    return { tier: "Iron", division: "IV" };
  }

  if (hasDivisions(tier)) {
    const divisionIndex = leagueRankDivisions.indexOf(division ?? "IV");

    if (divisionIndex < leagueRankDivisions.length - 1) {
      return { tier, division: leagueRankDivisions[divisionIndex + 1] };
    }

    const tierIndex = leagueRankTiers.indexOf(tier);
    const nextTier = leagueRankTiers[tierIndex + 1];

    return { tier: nextTier, division: hasDivisions(nextTier) ? "IV" : null };
  }

  if (tier === "Master") {
    return { tier: "Grandmaster", division: null };
  }

  if (tier === "Grandmaster") {
    return { tier: "Challenger", division: null };
  }

  return null;
}

function demoteRank(tier: LeagueRankName, division: LeagueRankDivision | null): Pick<LeagueRankState, "tier" | "division"> | null {
  if (tier === "Unranked" || (tier === "Iron" && division === "IV")) {
    return null;
  }

  if (hasDivisions(tier)) {
    const divisionIndex = leagueRankDivisions.indexOf(division ?? "IV");

    if (divisionIndex > 0) {
      return { tier, division: leagueRankDivisions[divisionIndex - 1] };
    }

    const tierIndex = leagueRankTiers.indexOf(tier);
    const previousTier = leagueRankTiers[tierIndex - 1];

    return { tier: previousTier, division: hasDivisions(previousTier) ? "I" : null };
  }

  if (tier === "Master") {
    return { tier: "Diamond", division: "I" };
  }

  if (tier === "Grandmaster") {
    return { tier: "Master", division: null };
  }

  if (tier === "Challenger") {
    return { tier: "Grandmaster", division: null };
  }

  return null;
}
