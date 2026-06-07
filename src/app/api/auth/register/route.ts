import { NextResponse } from "next/server";
import { z } from "zod";

import { createUser, findUserByEmail } from "@/db/repositories";
import { hashPassword } from "@/lib/auth/password";
import { isDatabaseConfigured } from "@/lib/env";

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

  const parsed = RegisterSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Check the display name, email, and password." }, { status: 400 });
  }

  const existingUser = await findUserByEmail(parsed.data.email);

  if (existingUser) {
    return NextResponse.json({ error: "An account already exists for that email." }, { status: 409 });
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
