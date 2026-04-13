import { db } from "@/db";
import { profiles, platforms } from "@/db/schema";
import { NewPostForm } from "@/components/new-post-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDashboardCandidates } from "@/lib/dashboard/candidates";
import { ManualCandidateCard } from "@/components/dashboard/manual-candidate-card";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const allProfiles = await db.select().from(profiles);
  const allPlatforms = await db.select().from(platforms);
  const candidates = await getDashboardCandidates(8);

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Create Post</h1>
        <p className="text-sm text-gray-600 mt-1">
          Create a new post to schedule across your platforms
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <NewPostForm
            profiles={allProfiles}
            platforms={allPlatforms}
            initialValues={{
              title: params.title,
              content: params.content,
              contentType: params.contentType,
              sourceUrl: params.sourceUrl,
              mediaUrl: params.mediaUrl,
            }}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Manual candidates</h2>
              <p className="mt-1 text-sm text-gray-600">
                Recent stories, OG-image first. Roughly last 48h.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {candidates.map((candidate) => {
              const href = `/dashboard/posts/new?${new URLSearchParams({
                title: candidate.title,
                content: candidate.title,
                contentType: candidate.ogImageUrl ? "image" : "text",
                sourceUrl: candidate.link,
                ...(candidate.ogImageUrl ? { mediaUrl: candidate.ogImageUrl } : {}),
              }).toString()}`;

              return (
                <ManualCandidateCard
                  key={candidate.link}
                  candidate={candidate}
                  href={href}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
