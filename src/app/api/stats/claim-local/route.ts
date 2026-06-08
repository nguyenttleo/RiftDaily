import { createHash } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { claimLocalProgress } from "@/db/repositories";
import { normalizeRankState, type LeagueRankState } from "@/game/scoring";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs";

const modeKeySchema = z.enum(["item-build", "item-recipe", "guess-elo", "champion-matchup", "dodge-queue", "tft-recipe", "tft-connections"]);
const rankTierSchema = z.enum(["Unranked", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"]);
const rankDivisionSchema = z.enum(["IV", "III", "II", "I"]);

const localModeSchema = z.object({
  gameKey: modeKeySchema,
  currentStreak: z.number().int().min(0).max(10000),
  bestStreak: z.number().int().min(0).max(10000),
  gamesPlayed: z.number().int().min(0).max(100000),
  wins: z.number().int().min(0).max(100000)
});

const localRankSchema = z.object({
  tier: rankTierSchema,
  division: rankDivisionSchema.nullable(),
  lp: z.number().int().min(0).max(100000),
  lastLpChange: z.number().int().min(-30).max(30).nullable(),
  gamesPlayed: z.number().int().min(0).max(100000),
  wins: z.number().int().min(0).max(100000)
});

const claimSchema = z.object({
  modes: z.array(localModeSchema).max(12).default([]),
  rankState: localRankSchema.nullable().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in before saving guest progress." }, { status: 401 });
  }

  const parsed = claimSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid guest progress payload." }, { status: 400 });
  }

  const payload = canonicalizePayload(parsed.data);
  const claimId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const result = await claimLocalProgress({
    userId: session.user.id,
    claimId,
    modes: payload.modes,
    rankState: payload.rankState,
    payload
  });

  return NextResponse.json(result);
}

function canonicalizePayload(payload: z.infer<typeof claimSchema>): {
  modes: Array<{
    gameKey: z.infer<typeof modeKeySchema>;
    currentStreak: number;
    bestStreak: number;
    gamesPlayed: number;
    wins: number;
  }>;
  rankState: LeagueRankState | null;
} {
  const modes = payload.modes
    .map((mode) => {
      const gamesPlayed = Math.max(0, Math.round(mode.gamesPlayed));
      const currentStreak = Math.max(0, Math.round(mode.currentStreak));
      const bestStreak = Math.max(currentStreak, Math.round(mode.bestStreak));

      return {
        gameKey: mode.gameKey,
        currentStreak,
        bestStreak,
        gamesPlayed,
        wins: Math.max(0, Math.min(gamesPlayed, Math.round(mode.wins)))
      };
    })
    .filter((mode) => mode.gamesPlayed > 0 || mode.currentStreak > 0 || mode.bestStreak > 0)
    .sort((a, b) => a.gameKey.localeCompare(b.gameKey));

  const rankState = payload.rankState
    ? clampRankWins(
        normalizeRankState({
        tier: payload.rankState.tier,
        division: payload.rankState.division,
        lp: payload.rankState.lp,
        lastLpChange: payload.rankState.lastLpChange,
        gamesPlayed: payload.rankState.gamesPlayed,
        wins: payload.rankState.wins
        })
      )
    : null;

  return { modes, rankState };
}

function clampRankWins(rankState: LeagueRankState): LeagueRankState {
  return {
    ...rankState,
    wins: Math.max(0, Math.min(rankState.gamesPlayed, rankState.wins))
  };
}
