import { NextRequest, NextResponse } from "next/server";
import { BYPASS_SIGNED_OUT_COOKIE } from "@/lib/auth-config";
import { getRequestAppUrl } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/dashboard", getRequestAppUrl(request)),
    { status: 303 }
  );

  response.cookies.delete(BYPASS_SIGNED_OUT_COOKIE);
  return response;
}
