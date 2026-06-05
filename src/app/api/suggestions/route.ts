import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSuggestion } from "@/db/repositories";
import { authOptions } from "@/lib/auth/options";

export const runtime = "nodejs";

const suggestionSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  contact: z.string().trim().max(180).optional().or(z.literal("")),
  type: z.string().trim().min(2).max(80),
  message: z.string().trim().min(10).max(4000),
  page: z.string().trim().max(120).optional().or(z.literal(""))
});

export async function POST(request: Request) {
  const parsed = suggestionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Please include a suggestion with at least 10 characters." }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const result = await createSuggestion({
    userId: session?.user?.id,
    name: parsed.data.name || undefined,
    contact: parsed.data.contact || undefined,
    type: parsed.data.type,
    message: parsed.data.message,
    page: parsed.data.page || undefined
  });

  return NextResponse.json({ ok: true, persisted: result.persisted });
}
