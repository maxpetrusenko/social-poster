import { createMagicLink } from "@/lib/auth";
import {
  getMagicLinkUrl,
  hasSmtpConfig,
  sendMagicLinkEmail,
} from "@/lib/mail";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = loginSchema.parse(body);
    const token = await createMagicLink(email);
    const baseUrl = request.nextUrl.origin;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized email" },
        { status: 403 }
      );
    }

    await sendMagicLinkEmail(email, token, baseUrl);

    return NextResponse.json({
      success: true,
      previewUrl: hasSmtpConfig() ? null : getMagicLinkUrl(token, baseUrl),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { error: "Failed to send magic link" },
      { status: 500 }
    );
  }
}
