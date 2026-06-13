import { NextResponse } from "next/server";

import { getLatestDataDragonVersion, getLivePublicChampions } from "@/lib/riot/data-dragon";
import { getMatchChampionMasteriesById } from "@/lib/riot/match-v5";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const normalizedMatchId = matchId.trim().toUpperCase();
  const count = Math.max(1, Math.min(5, Number(new URL(request.url).searchParams.get("count") ?? 3) || 3));

  if (!/^[A-Z0-9]+_\d+$/.test(normalizedMatchId)) {
    return NextResponse.json({ error: "Invalid Riot match ID." }, { status: 400 });
  }

  try {
    const version = await getLatestDataDragonVersion();
    const publicChampions = await getLivePublicChampions(version);
    const mastery = await getMatchChampionMasteriesById({
      matchId: normalizedMatchId,
      publicChampions,
      count
    });

    if (!mastery) {
      return NextResponse.json({ error: "Champion mastery unavailable." }, { status: 404 });
    }

    const response = NextResponse.json(mastery);
    response.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Champion mastery lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
