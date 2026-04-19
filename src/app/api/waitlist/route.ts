import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, source } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const now = new Date();
    await db
      .insert(waitlistSignups)
      .values({ id: nanoid(), email: email.toLowerCase().trim(), source: source || "landing", createdAt: now })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
