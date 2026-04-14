import { verifyMagicLink } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const appUrl = getRequestAppUrl(request);

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=missing_token", appUrl)
    );
  }

  const email = await verifyMagicLink(token);

  if (!email) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_or_expired", appUrl)
    );
  }

  return NextResponse.redirect(new URL("/dashboard", appUrl));
}
