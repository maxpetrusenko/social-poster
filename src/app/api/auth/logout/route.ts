import { logout } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeAppNextPath } from "@/lib/safe-next-path";

export async function POST(request: NextRequest) {
  await logout();

  const requestedNext = request.nextUrl.searchParams.get("next");
  const nextPath = sanitizeAppNextPath(requestedNext);
  const loginUrl = new URL("/login", getRequestAppUrl(request));
  if (requestedNext && nextPath !== "/dashboard") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return NextResponse.redirect(loginUrl, { status: 303 });
}
