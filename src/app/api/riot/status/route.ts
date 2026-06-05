import { NextResponse } from "next/server";

import { isRiotApiConfigured } from "@/lib/env";
import { getChampionRotation } from "@/lib/riot/api";
import { getLatestDataDragonVersion } from "@/lib/riot/data-dragon";

export const runtime = "nodejs";

export async function GET() {
  const rotation = await getChampionRotation().catch(() => null);

  return NextResponse.json({
    dataDragonVersion: await getLatestDataDragonVersion(),
    riotApiConfigured: isRiotApiConfigured(),
    championRotation: rotation
  });
}
