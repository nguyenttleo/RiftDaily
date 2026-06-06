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
  metadata: z.record(z.unknown()).optional()
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
