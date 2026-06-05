import type { AbilityGuessResult, ChampionGuessResult } from "@/types";

export function formatAbilityShare(date: string, guesses: AbilityGuessResult[]): string {
  const solved = guesses.some((guess) => guess.correct);
  const last = guesses.at(-1);
  const count = solved ? last?.attemptNumber ?? guesses.length : "X";
  const rows = guesses.map((guess) => {
    if (guess.correct) {
      return "🟩🟩";
    }

    return `${guess.championCorrect ? "🟩" : "⬛"}${guess.slotCorrect ? "🟩" : "⬛"}`;
  });

  return [`Rift Daily Ability ${date} ${count}/6`, ...rows].join("\n");
}

export function formatChampionShare(date: string, guesses: ChampionGuessResult[]): string {
  const solved = guesses.some((guess) => guess.correct);
  const last = guesses.at(-1);
  const count = solved ? last?.attemptNumber ?? guesses.length : "X";
  const rows = guesses.map((guess) =>
    guess.feedback
      .map((feedback) => {
        if (feedback.status === "correct") {
          return "🟩";
        }

        if (feedback.status === "present") {
          return "🟨";
        }

        if (feedback.status === "higher" || feedback.status === "lower") {
          return "🟦";
        }

        return "⬛";
      })
      .join("")
  );

  return [`Rift Daily Champion ${date} ${count}/8`, ...rows].join("\n");
}
