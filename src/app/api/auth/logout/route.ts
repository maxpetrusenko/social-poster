import { logout } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  await logout();

  return NextResponse.redirect(new URL("/login", getRequestAppUrl(request)));
}
