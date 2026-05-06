import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { SocialInboxPaused } from "@/components/dashboard/social-inbox-paused";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function InboxDmsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  return (
    <SocialInboxPaused
      icon={Send}
      label="DMs"
      title="DMs are paused until the handoff is safer."
      description="Direct messages need stricter safeguards than public queues, so access is temporarily blocked while we finish the permission model, audit trail, and reply handoff. The goal is simple: fewer surprises, better control, and a calmer inbox when it comes back."
    />
  );
}
