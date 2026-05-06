import { db } from "@/db";
import { platforms } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardPageContent } from "@/components/dashboard/ui";
import EditPlatformForm from "./edit-form";
import { getTenantContext } from "@/lib/tenancy";

export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const platform = await db.query.platforms.findFirst({
    where: and(eq(platforms.id, id), eq(platforms.workspaceId, tenant.currentWorkspace.id)),
  });

  if (!platform) {
    notFound();
  }

  return (
    <DashboardPageContent className="max-w-2xl">
      <div>
        {/* Header */}
        <Link
          href="/dashboard/platforms"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Platforms
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900 mb-6">
          Manage Connection
        </h1>

        <EditPlatformForm platform={platform} />
      </div>
    </DashboardPageContent>
  );
}
