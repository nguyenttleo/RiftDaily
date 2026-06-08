import { NextResponse } from "next/server";

import { getLeaderboard } from "@/db/repositories";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.round(requestedLimit))) : 20;

  const response = NextResponse.json({
    entries: await getLeaderboard(limit)
  });
  response.headers.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
  response.headers.set("Vary", "Accept-Encoding");
  return response;
}
