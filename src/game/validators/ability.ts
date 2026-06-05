import { getAbilityById, getChampionById, normalizeChampionId } from "@/game/data/champions";
import { getAbilityHints } from "@/game/hints";
import { championSplashUrl, championSquareUrl } from "@/lib/riot/data-dragon";
import type { AbilityGuessInput, AbilityGuessResult } from "@/types";

export function validateAbilityGuess(
  answerId: string,
  guess: AbilityGuessInput,
  attemptNumber: number,
  maxAttempts: number,
  version: string
): AbilityGuessResult {
  const answer = getAbilityById(answerId);

  if (!answer) {
    throw new Error(`Unknown ability answer: ${answerId}`);
  }

  const champion = getChampionById(answer.championId);

  if (!champion) {
    throw new Error(`Unknown champion answer: ${answer.championId}`);
  }

  const championCorrect = normalizeChampionId(guess.championId) === normalizeChampionId(answer.championId);
  const slotCorrect = guess.slot === answer.slot;
  const correct = championCorrect && slotCorrect;

  const revealAnswer = correct || attemptNumber >= maxAttempts;

  return {
    correct,
    attemptNumber,
    maxAttempts,
    championCorrect,
    slotCorrect,
    hints: revealAnswer ? getAbilityHints(answer.id, 5) : getAbilityHints(answer.id, attemptNumber),
    solvedAnswer: revealAnswer
      ? {
          championId: champion.id,
          championName: champion.name,
          slot: answer.slot,
          abilityName: answer.name,
          squareUrl: championSquareUrl(version, champion.id),
          splashUrl: championSplashUrl(champion.id)
        }
      : undefined
  };
}
