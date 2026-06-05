import { getChampionById, normalizeChampionId } from "@/game/data/champions";
import { toPublicChampion } from "@/lib/riot/data-dragon";
import type { ChampionFeedbackRow, ChampionGuessInput, ChampionGuessResult, GuessStatus } from "@/types";

export function validateChampionGuess(
  answerId: string,
  guess: ChampionGuessInput,
  attemptNumber: number,
  maxAttempts: number,
  version: string
): ChampionGuessResult {
  const answer = getChampionById(answerId);
  const guessed = getChampionById(guess.championId);

  if (!answer) {
    throw new Error(`Unknown champion answer: ${answerId}`);
  }

  if (!guessed) {
    throw new Error(`Unknown champion guess: ${guess.championId}`);
  }

  const correct = normalizeChampionId(guessed.id) === normalizeChampionId(answer.id);

  return {
    correct,
    attemptNumber,
    maxAttempts,
    guessedChampion: toPublicChampion(guessed, version),
    feedback: buildChampionFeedback(guessed, answer),
    solvedAnswer: correct || attemptNumber >= maxAttempts ? toPublicChampion(answer, version) : undefined
  };
}

function buildChampionFeedback(guess: NonNullable<ReturnType<typeof getChampionById>>, answer: NonNullable<ReturnType<typeof getChampionById>>): ChampionFeedbackRow[] {
  return [
    {
      key: "roles",
      label: "Class",
      guessValue: guess.roles.join(" / "),
      status: roleStatus(guess.roles, answer.roles)
    },
    {
      key: "resource",
      label: "Resource",
      guessValue: guess.resource,
      status: exactStatus(guess.resource, answer.resource)
    },
    {
      key: "titleLength",
      label: "Title",
      guessValue: `${guess.title.length} chars`,
      status: numericStatus(guess.title.length, answer.title.length)
    },
    {
      key: "key",
      label: "Roster #",
      guessValue: String(guess.key),
      status: numericStatus(guess.key, answer.key)
    }
  ];
}

function exactStatus(guess: string, answer: string): GuessStatus {
  return guess === answer ? "correct" : "wrong";
}

function roleStatus(guess: string[], answer: string[]): GuessStatus {
  const exact =
    guess.length === answer.length && guess.every((role) => answer.includes(role)) && answer.every((role) => guess.includes(role));

  if (exact) {
    return "correct";
  }

  return guess.some((role) => answer.includes(role)) ? "present" : "wrong";
}

function numericStatus(guess: number, answer: number): GuessStatus {
  if (guess === answer) {
    return "correct";
  }

  return guess < answer ? "higher" : "lower";
}
