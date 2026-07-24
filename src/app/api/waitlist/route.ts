import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { isAppHost, normalizeHost } from "@/lib/site-domains";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );

  if (isAppHost(host)) {
    return NextResponse.json(
      {
        error: "Waitlist registration is closed. Sign in to use SMM Agent.",
        loginUrl: "/login",
      },
      {
        status: 410,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const { email, source } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedSource = typeof source === "string" && source.trim()
      ? source.trim()
      : "landing";
    await db
      .insert(waitlistSignups)
      .values({
        id: nanoid(),
        email: email.toLowerCase().trim(),
        source: host ? `${host}:${normalizedSource}` : normalizedSource,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
