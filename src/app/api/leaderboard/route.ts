import { NextResponse } from "next/server";

import { getLeaderboard } from "@/db/repositories";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    entries: await getLeaderboard()
  });
}
