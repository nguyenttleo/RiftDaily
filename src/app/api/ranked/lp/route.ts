import { NextResponse } from "next/server";

import { getRankedSoloLpByRiotId } from "@/lib/riot/match-v5";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const riotId = url.searchParams.get("riotId")?.trim() ?? "";
  const platform = url.searchParams.get("platform")?.trim() ?? undefined;

  if (!riotId.includes("#")) {
    return NextResponse.json({ error: "Riot ID must include a game name and tag line." }, { status: 400 });
  }

  try {
    const proof = await getRankedSoloLpByRiotId({ riotId, platform });

    if (!proof) {
      return NextResponse.json({ error: "Ranked solo LP unavailable." }, { status: 404 });
    }

    const response = NextResponse.json(proof);
    response.headers.set("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ranked LP lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
