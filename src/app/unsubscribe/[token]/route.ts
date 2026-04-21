import { NextResponse } from "next/server";
import { suppressEmail, verifyUnsubscribeToken } from "@/lib/marketing/unsubscribe";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return new Response("Invalid unsubscribe link.", { status: 400 });
  }

  return new Response(
    `<!doctype html>
      <html>
        <head><title>Unsubscribe</title></head>
        <body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 64px auto; color: #171717;">
          <h1>Unsubscribe</h1>
          <p>Stop marketing emails for ${payload.email}.</p>
          <form method="post">
            <button style="background: #171717; color: white; border: 0; border-radius: 8px; padding: 12px 16px; font-weight: 700;">Unsubscribe</button>
          </form>
        </body>
      </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await suppressEmail({
    email: payload.email,
    scope: payload.scope,
    reason: "unsubscribe",
    provider: "app",
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
