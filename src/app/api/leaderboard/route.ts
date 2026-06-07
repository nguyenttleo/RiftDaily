import { NextResponse } from "next/server";

import { getLeaderboard } from "@/db/repositories";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.round(requestedLimit))) : 20;

  return NextResponse.json({
    entries: await getLeaderboard(limit)
  });
}
