import { db } from "@/db";
import { platforms } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import EditPlatformForm from "./edit-form";

export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const platform = await db.query.platforms.findFirst({
    where: eq(platforms.id, id),
  });

  if (!platform) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
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
    </div>
  );
}
