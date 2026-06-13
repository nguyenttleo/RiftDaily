import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordRankedGameResult } from "@/db/repositories";
import { authOptions } from "@/lib/auth/options";
import { logSecurityEvent, requestIp, requestUserAgent } from "@/lib/security/audit-log";

export const runtime = "nodejs";

const resultSchema = z.object({
  gameKey: z.string().min(2).max(64).regex(/^[a-z0-9:-]+$/i),
  roundId: z.string().min(2).max(256),
  won: z.boolean(),
  performanceQuality: z.number().min(0).max(1),
  lpDelta: z.number().int().min(-30).max(30).optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    logSecurityEvent({
      type: "ranked_result_unauthenticated",
      severity: "low",
      route: "/api/ranked/results",
      outcome: "denied",
      ip: requestIp(request),
      userAgent: requestUserAgent(request)
    });

    return NextResponse.json({ error: "Sign in to save ranked progress." }, { status: 401 });
  }

  const parsed = resultSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    logSecurityEvent({
      type: "ranked_result_invalid_payload",
      severity: "low",
      route: "/api/ranked/results",
      outcome: "denied",
      userId: session.user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        issueCount: parsed.error.issues.length,
        fields: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean)
      }
    });

    return NextResponse.json({ error: "Invalid ranked result payload." }, { status: 400 });
  }

  const { lpDelta, ...rankedResult } = parsed.data;

  if (typeof lpDelta === "number") {
    logSecurityEvent({
      type: "client_controlled_lp_delta_ignored",
      severity: "medium",
      route: "/api/ranked/results",
      outcome: "ignored",
      userId: session.user.id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        gameKey: rankedResult.gameKey,
        roundId: rankedResult.roundId,
        clientLpDelta: lpDelta
      }
    });
  }

  const result = await recordRankedGameResult({
    userId: session.user.id,
    ...rankedResult
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
