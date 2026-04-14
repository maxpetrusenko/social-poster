import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, posts, postTargets, profiles } from "@/db/schema";
import { NewPostForm } from "@/components/new-post-form";
import { DashboardHero, HeroButton } from "@/components/dashboard/ui";
import { getSession } from "@/lib/auth";
import { mapComposerPlatforms } from "@/lib/dashboard/composer";

function toDateTimeLocalValue(value: Date | null) {
  if (!value) return "";

  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [post, targetRows, allProfiles, allPlatforms] = await Promise.all([
    db.query.posts.findFirst({ where: eq(posts.id, id) }),
    db.select().from(postTargets).where(eq(postTargets.postId, id)),
    db.select().from(profiles),
    db.select().from(platforms),
  ]);

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Edit Draft"
        title={post.title || "Refine post"}
        description="Post detail now folds back into the canonical composer. Save draft, reschedule, or publish from one place."
        actions={
          <>
            <HeroButton href={`/dashboard/posts/${post.id}`} tone="ghost">
              View Post
            </HeroButton>
            <HeroButton href="/dashboard/publish">Publish</HeroButton>
          </>
        }
      />

      <Link
        href={`/dashboard/posts/${post.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-tech)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to post detail
      </Link>

      <div className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-8 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
        <NewPostForm
          postId={post.id}
          profiles={allProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          platforms={mapComposerPlatforms(allPlatforms)}
          submitLabel="Save Draft"
          initialValues={{
            title: post.title || "",
            content: post.content,
            contentType: post.contentType,
            sourceUrl: post.sourceUrl || "",
            mediaUrl: post.mediaUrl || "",
            scheduledAt: toDateTimeLocalValue(post.scheduledAt),
            profileId: post.profileId || "",
            platformIds: targetRows.map((target) => target.platformId),
          }}
        />
      </div>
    </div>
  );
}
