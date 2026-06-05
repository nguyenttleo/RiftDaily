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

export function rankFromStats(currentStreak: number, winRate: number): string {
  if (currentStreak >= 30 && winRate >= 80) {
    return "Challenger";
  }

  if (currentStreak >= 14 && winRate >= 70) {
    return "Diamond";
  }

  if (currentStreak >= 7 && winRate >= 60) {
    return "Platinum";
  }

  if (currentStreak >= 3) {
    return "Gold";
  }

  return "Unranked";
}
