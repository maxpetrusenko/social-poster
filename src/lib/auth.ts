import { db } from "@/db";
import { sessions, magicLinks } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  AUTH_MODE,
  ALLOWED_EMAIL,
  getAuthConfigError,
  MAGIC_LINK_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/auth-config";
import {
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowedForAuth } from "@/lib/auth-allowlist";

function id() {
  return crypto.randomUUID();
}

function token() {
  return crypto.randomBytes(32).toString("hex");
}

function getBypassSession() {
  const now = new Date();

  return {
    id: "auth-disabled",
    email: ALLOWED_EMAIL,
    token: "auth-disabled",
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
  };
}

async function getSupabaseSession() {
  if (AUTH_MODE !== "supabase" || !isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !(await isEmailAllowedForAuth(user?.email))) {
    return null;
  }

  const now = new Date();

  return {
    id: user!.id,
    email: user!.email ?? ALLOWED_EMAIL,
    token: "supabase",
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
  };
}

export async function createMagicLink(email: string): Promise<string | null> {
  if (AUTH_MODE !== "magic_link") return null;
  if (!(await isEmailAllowedForAuth(email))) return null;

  const t = token();
  const now = new Date();
  db.insert(magicLinks)
    .values({
      id: id(),
      email: email.toLowerCase(),
      token: t,
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
      createdAt: now,
    })
    .run();

  return t;
}

export async function verifyMagicLink(t: string): Promise<string | null> {
  if (AUTH_MODE !== "magic_link") return null;

  const link = db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.token, t),
        gt(magicLinks.expiresAt, new Date()),
      )
    )
    .get();

  if (!link || link.usedAt) return null;

  // Mark used
  db.update(magicLinks)
    .set({ usedAt: new Date() })
    .where(eq(magicLinks.id, link.id))
    .run();

  // Create session
  const sessionToken = token();
  const now = new Date();
  db.insert(sessions)
    .values({
      id: id(),
      email: link.email,
      token: sessionToken,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
    })
    .run();

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  return link.email;
}

export async function getSession() {
  if (AUTH_MODE === "bypass") {
    return getBypassSession();
  }

  if (AUTH_MODE === "misconfigured") {
    return null;
  }

  const supabaseSession = await getSupabaseSession();
  if (supabaseSession) {
    return supabaseSession;
  }

  if (AUTH_MODE === "supabase" || isSupabaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const t = cookieStore.get(SESSION_COOKIE)?.value;
  if (!t) return null;

  const session = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token, t),
        gt(sessions.expiresAt, new Date()),
      )
    )
    .get();

  return session ?? null;
}

export async function logout() {
  if (AUTH_MODE === "bypass" || AUTH_MODE === "misconfigured") return;

  if (AUTH_MODE === "supabase" && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return;
  }

  const cookieStore = await cookies();
  const t = cookieStore.get(SESSION_COOKIE)?.value;
  if (t) {
    db.delete(sessions).where(eq(sessions.token, t)).run();
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireApiSession() {
  if (AUTH_MODE === "bypass") {
    return getBypassSession();
  }

  if (AUTH_MODE === "misconfigured") {
    return NextResponse.json(
      { error: getAuthConfigError() ?? "Authentication is misconfigured." },
      { status: 503 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}
