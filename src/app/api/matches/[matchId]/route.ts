import { NextResponse } from "next/server";

import { getLatestDataDragonVersion, getLivePublicChampions, getLiveSummonerSpells } from "@/lib/riot/data-dragon";
import { getVerifiedMatchProofById } from "@/lib/riot/match-v5";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const normalizedMatchId = matchId.trim().toUpperCase();

  if (!/^[A-Z0-9]+_\d+$/.test(normalizedMatchId)) {
    return NextResponse.json({ error: "Invalid Riot match ID." }, { status: 400 });
  }

  try {
    const version = await getLatestDataDragonVersion();
    const [publicChampions, summonerSpells] = await Promise.all([
      getLivePublicChampions(version),
      getLiveSummonerSpells(version)
    ]);
    const proof = await getVerifiedMatchProofById({
      matchId: normalizedMatchId,
      publicChampions,
      summonerSpells
    });

    if (!proof) {
      return NextResponse.json({ error: "Match proof unavailable." }, { status: 404 });
    }

    const response = NextResponse.json(proof);
    response.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Match proof lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
