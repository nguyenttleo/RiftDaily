import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getUserStats } from "@/db/repositories";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);

  const response = NextResponse.json({
    stats: await getUserStats(session?.user?.id, session?.user?.username ?? session?.user?.name ?? "Guest")
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
