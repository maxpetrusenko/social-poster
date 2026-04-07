import { verifyMagicLink } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=missing_token", request.url)
    );
  }

  const email = await verifyMagicLink(token);

  if (!email) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_or_expired", request.url)
    );
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
