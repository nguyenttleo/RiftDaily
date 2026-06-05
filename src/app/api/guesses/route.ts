import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDailyChallengeById, recordGuess, roleForAnswer } from "@/db/repositories";
import { generateDailyChallengeSet } from "@/game/generators/daily";
import { validateAbilityGuess } from "@/game/validators/ability";
import { validateChampionGuess } from "@/game/validators/champion";
import { authOptions } from "@/lib/auth/options";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion } from "@/lib/riot/data-dragon";
import type { AbilityGuessInput, ChallengeType, ChampionGuessInput } from "@/types";

export const runtime = "nodejs";

const GuessSchema = z.object({
  challengeId: z.string().min(3),
  challengeType: z.enum(["ability", "champion"]),
  guess: z.record(z.unknown()),
  attemptNumber: z.number().int().min(1).max(12),
  elapsedMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).default(0)
});

export async function POST(request: Request) {
  const parsed = GuessSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid guess payload." }, { status: 400 });
  }

  const version = await getLatestDataDragonVersion();
  const challenge = await resolveAnswer(parsed.data.challengeId, parsed.data.challengeType, version);

  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  const result =
    parsed.data.challengeType === "ability"
      ? validateAbilityGuess(
          challenge.answerId,
          parsed.data.guess as unknown as AbilityGuessInput,
          parsed.data.attemptNumber,
          challenge.maxAttempts,
          version
        )
      : validateChampionGuess(
          challenge.answerId,
          parsed.data.guess as unknown as ChampionGuessInput,
          parsed.data.attemptNumber,
          challenge.maxAttempts,
          version
        );

  const session = await getServerSession(authOptions);

  if (session?.user?.id && challenge.databaseId) {
    await recordGuess({
      userId: session.user.id,
      challengeId: challenge.databaseId,
      challengeType: parsed.data.challengeType,
      date: challenge.date,
      guess: parsed.data.guess,
      correct: result.correct,
      attemptNumber: parsed.data.attemptNumber,
      elapsedMs: parsed.data.elapsedMs,
      answerRoles: roleForAnswer(challenge.answerId)
    });
  }

  return NextResponse.json(result);
}

async function resolveAnswer(
  challengeId: string,
  challengeType: ChallengeType,
  version: string
): Promise<{ answerId: string; date: string; maxAttempts: number; databaseId?: string } | null> {
  if (challengeId.startsWith("infinite:")) {
    return null;
  }

  if (isDatabaseConfigured()) {
    const row = await getDailyChallengeById(challengeId);

    if (row) {
      return {
        answerId: row.answer_id,
        date: row.date,
        maxAttempts: challengeType === "ability" ? 6 : 8,
        databaseId: row.id
      };
    }
  }

  const daily = generateDailyChallengeSet(version, env.challengeSalt);
  const challenge = challengeType === "ability" ? daily.ability : daily.champion;

  return {
    answerId: challenge.answerId,
    date: daily.date,
    maxAttempts: challenge.publicChallenge.maxAttempts
  };
}
