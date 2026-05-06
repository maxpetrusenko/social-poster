import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { SocialInboxPaused } from "@/components/dashboard/social-inbox-paused";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function InboxCommentsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  return (
    <SocialInboxPaused
      icon={MessageCircle}
      label="Comments"
      title="Comments are getting a careful tune-up."
      description="This page is temporarily blocked while we finish the comment workflow, platform permission checks, and response controls. Nothing is broken on your side; we are keeping this area quiet until it is dependable enough for client-facing conversations."
    />
  );
}
