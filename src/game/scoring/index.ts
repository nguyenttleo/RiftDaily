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

export function nextRankProgress(progress: RankProgressInput): { points: number; nextRank: string | null; nextPoints: number | null; percent: number } {
  const points = rankPointsFromProgress(progress);
  const ascending = [...rankThresholds].reverse();
  const next = ascending.find((threshold) => points < threshold.points);
  let previous = 0;

  for (const threshold of ascending) {
    if (points >= threshold.points) {
      previous = threshold.points;
    }
  }

  if (!next) {
    return { points, nextRank: null, nextPoints: null, percent: 100 };
  }

  const span = next.points - previous;
  const percent = span > 0 ? Math.round(((points - previous) / span) * 100) : 0;

  return {
    points,
    nextRank: next.rank,
    nextPoints: next.points,
    percent: Math.max(0, Math.min(100, percent))
  };
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
