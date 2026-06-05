import { NextResponse } from "next/server";

import { ensureDailyChallenge, getDailyChallengeByDateType, getRecentAnswerIds } from "@/db/repositories";
import { abilities, champions } from "@/game/data/champions";
import {
  createAbilityChallenge,
  createChampionChallenge,
  getUtcDateKey,
  seededIndex
} from "@/game/generators/daily";
import { env, isDatabaseConfigured } from "@/lib/env";
import { getLatestDataDragonVersion } from "@/lib/riot/data-dragon";
import type { ChallengeType } from "@/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return generate(request);
}

export async function POST(request: Request) {
  return generate(request);
}

async function generate(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret") ?? "";

  if (env.cronSecret && token !== env.cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      persistence: "local",
      message: "DATABASE_URL is not configured; daily challenges will be generated in memory."
    });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? getUtcDateKey();
  const version = await getLatestDataDragonVersion();
  const ability = await ensureChallenge("ability", date, version);
  const champion = await ensureChallenge("champion", date, version);

  return NextResponse.json({
    ok: true,
    date,
    challenges: {
      ability,
      champion
    }
  });
}

async function ensureChallenge(type: ChallengeType, date: string, version: string) {
  const existing = await getDailyChallengeByDateType(date, type);

  if (existing) {
    return {
      id: existing.id,
      type,
      answerId: existing.answer_id,
      existed: true
    };
  }

  const seed = `${env.challengeSalt}:${date}:${type}`;
  const candidates = type === "ability" ? abilities.map((ability) => ability.id) : champions.map((champion) => champion.id);
  const recent = await getRecentAnswerIds(type);
  const answerId = selectAnswerAvoidingRecent(type, seed, candidates, recent);
  const challenge =
    type === "ability"
      ? createAbilityChallenge(answerId, date, seed, version)
      : createChampionChallenge(answerId, date, seed, version);
  const row = await ensureDailyChallenge({
    date,
    challengeType: type,
    answerId,
    seed,
    difficulty: challenge.publicChallenge.difficulty
  });

  return {
    id: row?.id ?? challenge.publicChallenge.id,
    type,
    answerId,
    existed: false
  };
}

function selectAnswerAvoidingRecent(type: ChallengeType, seed: string, answerIds: string[], recent: string[]): string {
  const start = seededIndex(`${seed}:${type}:answer`, answerIds.length);
  const recentSet = new Set(recent);

  for (let offset = 0; offset < answerIds.length; offset += 1) {
    const answer = answerIds[(start + offset) % answerIds.length];

    if (!recentSet.has(answer)) {
      return answer;
    }
  }

  return answerIds[start];
}
