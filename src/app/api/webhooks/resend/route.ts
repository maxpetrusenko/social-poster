import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailEvents, notificationDeliveries } from "@/db/schema";
import { suppressEmail } from "@/lib/marketing/unsubscribe";

export const dynamic = "force-dynamic";

function decodeSvixSecret(secret: string) {
  const value = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(value, "base64");
}

function verifySignature(input: {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !input.id || !input.timestamp || !input.signature) return false;

  const signed = `${input.id}.${input.timestamp}.${input.body}`;
  const expected = crypto
    .createHmac("sha256", decodeSvixSecret(secret))
    .update(signed)
    .digest("base64");

  const signatures = input.signature
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.replace(/^v1,/, "").replace(/^v1=/, "").trim())
    .filter(Boolean);

  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readEmail(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : {};
  const to = data.to;
  if (typeof to === "string") return to.toLowerCase();
  if (Array.isArray(to) && typeof to[0] === "string") return to[0].toLowerCase();
  return null;
}

function readExternalMessageId(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : {};
  return readString(data.email_id) ?? readString(data.emailId) ?? readString(data.id);
}

function deliveryStatusFor(eventType: string) {
  if (eventType.endsWith(".delivered")) return "delivered";
  if (eventType.endsWith(".bounced")) return "bounced";
  if (eventType.endsWith(".complained")) return "complained";
  if (eventType.endsWith(".failed")) return "failed_terminal";
  if (eventType.endsWith(".suppressed")) return "suppressed";
  if (eventType.endsWith(".delivery_delayed")) return "delayed";
  return null;
}

export async function POST(request: Request) {
  const body = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!verifySignature({ body, id, timestamp, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as Record<string, unknown>;
  const eventType = readString(payload.type) ?? "unknown";
  const providerEventId = id ?? crypto.randomUUID();
  const externalMessageId = readExternalMessageId(payload);
  const recipientEmail = readEmail(payload);
  const now = new Date();

  let deliveryId: string | null = null;
  if (externalMessageId) {
    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.externalMessageId, externalMessageId));
    deliveryId = delivery?.id ?? null;

    const status = deliveryStatusFor(eventType);
    if (status && delivery) {
      await db
        .update(notificationDeliveries)
        .set({
          status,
          deliveredAt: status === "delivered" ? now : delivery.deliveredAt,
          failedAt: ["bounced", "complained", "failed_terminal", "suppressed"].includes(status) ? now : delivery.failedAt,
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    }
  }

  await db
    .insert(emailEvents)
    .values({
      id: crypto.randomUUID(),
      deliveryId,
      provider: "resend",
      providerEventId,
      eventType,
      recipientEmail,
      externalMessageId,
      payload,
      createdAt: now,
    })
    .onConflictDoNothing();

  if (recipientEmail && eventType.endsWith(".bounced")) {
    await suppressEmail({
      email: recipientEmail,
      scope: "transactional_noncritical",
      reason: "hard_bounce",
      provider: "resend",
      eventId: providerEventId,
    });
  }

  if (recipientEmail && eventType.endsWith(".complained")) {
    await suppressEmail({
      email: recipientEmail,
      scope: "marketing",
      reason: "complaint",
      provider: "resend",
      eventId: providerEventId,
    });
  }

  return NextResponse.json({ ok: true });
}
