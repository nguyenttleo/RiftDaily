import { NextResponse } from "next/server";
import { z } from "zod";

import { createUser, findUserByEmail } from "@/db/repositories";
import { hashPassword } from "@/lib/auth/password";
import { isDatabaseConfigured } from "@/lib/env";
import { logSecurityEvent, requestIp, requestUserAgent } from "@/lib/security/audit-log";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_ -]+$/),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error: "Account creation needs DATABASE_URL. Connect Supabase before enabling accounts."
      },
      { status: 503 }
    );
  }

  const parsed = RegisterSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    logSecurityEvent({
      type: "register_invalid_payload",
      severity: "low",
      route: "/api/auth/register",
      outcome: "denied",
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        issueCount: parsed.error.issues.length,
        fields: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean)
      }
    });

    return NextResponse.json({ error: "Check the display name, email, and password." }, { status: 400 });
  }

  const existingUser = await findUserByEmail(parsed.data.email);

  if (existingUser) {
    logSecurityEvent({
      type: "register_duplicate_email",
      severity: "low",
      route: "/api/auth/register",
      outcome: "denied",
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: {
        emailDomain: parsed.data.email.split("@")[1] ?? "unknown"
      }
    });

    return NextResponse.json({ error: "Unable to create an account with those details." }, { status: 409 });
  }

  const user = await createUser({
    username: parsed.data.username,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.data.password)
  });

  return NextResponse.json({
    id: user.id,
    username: user.username,
    email: user.email
  });
}
