import "server-only";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ALLOWED_EMAIL } from "@/lib/auth-config";

function getAdminEmails(): string[] {
  const explicit = process.env.ADMIN_EMAILS?.trim();
  if (explicit) {
    return explicit.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  }
  return [ALLOWED_EMAIL.toLowerCase()];
}

export function isAdmin(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase());
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || !isAdmin(session.email)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireAdminApi() {
  const session = await getSession();
  if (!session || !isAdmin(session.email)) {
    return null;
  }
  return session;
}
