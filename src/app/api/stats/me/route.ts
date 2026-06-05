import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getUserStats } from "@/db/repositories";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);

  return NextResponse.json({
    stats: await getUserStats(session?.user?.id, session?.user?.username ?? session?.user?.name ?? "Guest")
  });
}
