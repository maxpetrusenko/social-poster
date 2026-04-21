import "server-only";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailSuppressions, notificationPreferences, users } from "@/db/schema";

type UnsubscribePayload = {
  email: string;
  scope: "marketing" | "all" | "transactional_noncritical";
  createdAt: number;
};

function secret() {
  return process.env.AUTH_SECRET?.trim() || "dev-unsubscribe-secret";
}

function sign(body: string) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createUnsubscribeToken(input: {
  email: string;
  scope?: UnsubscribePayload["scope"];
}) {
  const payload: UnsubscribePayload = {
    email: input.email.trim().toLowerCase(),
    scope: input.scope ?? "marketing",
    createdAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UnsubscribePayload;
    if (!payload.email || !payload.scope) return null;
    return {
      email: payload.email.trim().toLowerCase(),
      scope: payload.scope,
      createdAt: payload.createdAt,
    };
  } catch {
    return null;
  }
}

export async function suppressEmail(input: {
  email: string;
  scope?: UnsubscribePayload["scope"];
  reason: string;
  provider?: string;
  eventId?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const scope = input.scope ?? "marketing";
  const now = new Date();

  await db
    .insert(emailSuppressions)
    .values({
      id: crypto.randomUUID(),
      email,
      scope,
      reason: input.reason,
      provider: input.provider ?? null,
      eventId: input.eventId ?? null,
      createdAt: now,
    })
    .onConflictDoNothing();

  if (scope === "marketing") {
    const userRows = await db.select().from(users).where(eq(users.email, email));
    for (const user of userRows) {
      await db
        .update(notificationPreferences)
        .set({ marketingEmails: false, updatedAt: now })
        .where(and(eq(notificationPreferences.userId, user.id), eq(notificationPreferences.marketingEmails, true)));
    }
  }
}
