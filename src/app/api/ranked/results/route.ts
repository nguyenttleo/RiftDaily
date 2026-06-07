import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordRankedGameResult } from "@/db/repositories";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs";

const resultSchema = z.object({
  gameKey: z.string().min(2).max(64),
  roundId: z.string().min(2).max(256),
  won: z.boolean(),
  performanceQuality: z.number().min(0).max(1),
  lpDelta: z.number().int().min(-20).max(30).optional(),
  metadata: z.record(z.unknown()).optional()
}).superRefine((value, context) => {
  if (typeof value.lpDelta !== "number") {
    return;
  }

  const validWinDelta = value.won && value.lpDelta >= 20 && value.lpDelta <= 30;
  const validLossDelta = !value.won && value.lpDelta <= -10 && value.lpDelta >= -20;

  if (!validWinDelta && !validLossDelta) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lpDelta"],
      message: "LP delta must be +20 to +30 for wins or -10 to -20 for losses."
    });
  }
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to save ranked progress." }, { status: 401 });
  }

  const parsed = resultSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ranked result payload." }, { status: 400 });
  }

  const result = await recordRankedGameResult({
    userId: session.user.id,
    ...parsed.data
  });

  if (!result) {
    return NextResponse.json({ persisted: false }, { status: 202 });
  }

  return NextResponse.json({
    persisted: true,
    rankState: result.rankState,
    lpDelta: result.lpDelta
  });
}
