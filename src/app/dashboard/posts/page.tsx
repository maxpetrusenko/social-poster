import { db } from "@/db";
import { posts, postTargets, platforms } from "@/db/schema";
import Link from "next/link";
import { Plus, ImageIcon, Video, FileText, Sparkles } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { and, desc, eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";
import { redirect } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-50 text-blue-700",
  publishing: "bg-purple-50 text-purple-700",
  published: "bg-emerald-50 text-emerald-700",
  partial_failure: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E4405F",
  twitter: "#000000",
  x: "#000000",
  linkedin: "#0A66C2",
  linkedin_personal: "#0A66C2",
  linkedin_company: "#0A66C2",
  pinterest: "#BD081C",
  tiktok: "#000000",
  reddit: "#FF4500",
  youtube: "#FF0000",
  threads: "#000000",
  bluesky: "#0085FF",
};

const CONTENT_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  image: ImageIcon,
  video: Video,
  avatar_video: Sparkles,
};

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const whereClause =
    statusFilter !== "all"
      ? and(eq(posts.workspaceId, tenant.currentWorkspace.id), eq(posts.status, statusFilter))
      : eq(posts.workspaceId, tenant.currentWorkspace.id);

  const allPosts = await db
    .select()
    .from(posts)
    .where(whereClause)
    .orderBy(desc(posts.createdAt));

  const allPlatforms = await db
    .select({ id: platforms.id, type: platforms.type, name: platforms.name })
    .from(platforms)
    .where(eq(platforms.workspaceId, tenant.currentWorkspace.id));

  const platformMap = new Map(allPlatforms.map((p) => [p.id, p]));

  const postStatuses = await Promise.all(
    allPosts.map(async (post) => {
      const targets = await db
        .select()
        .from(postTargets)
        .where(eq(postTargets.postId, post.id));
      return { post, targets };
    })
  );

  const tabs = ["all", "draft", "scheduled", "published", "partial_failure", "failed"];

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-6 md:px-8 xl:px-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#171717] tracking-tight">Posts</h1>
          <p className="text-sm text-[#7f6c54] mt-0.5">
            Manage and schedule your social media posts
          </p>
        </div>
        <Link
          href="/dashboard/posts/create"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#171717] text-white text-sm font-medium rounded-xl hover:bg-[#2a2a2a] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Post
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#e5d9c8]">
        {tabs.map((status) => (
          <Link
            key={status}
            href={status === "all" ? "/dashboard/posts" : `/dashboard/posts?status=${status}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === status
                ? "border-[#171717] text-[#171717]"
                : "border-transparent text-[#8d7c64] hover:text-[#171717]"
            }`}
          >
            {status === "partial_failure"
              ? "Partial"
              : status.charAt(0).toUpperCase() + status.slice(1)}
          </Link>
        ))}
      </div>

      {/* Posts Grid */}
      {postStatuses.length === 0 ? (
        <div className="rounded-2xl border border-[#e5d9c8] bg-white p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f0e6]">
            <FileText className="h-6 w-6 text-[#8d7c64]" />
          </div>
          <p className="text-[#171717] font-medium mb-1">No posts yet</p>
          <p className="text-sm text-[#8d7c64] mb-5">
            Create your first post to get started.
          </p>
          <Link
            href="/dashboard/posts/create"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#171717] text-white text-sm font-medium rounded-xl hover:bg-[#2a2a2a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Post
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {postStatuses.map(({ post, targets }) => {
            const ContentIcon = CONTENT_TYPE_ICON[post.contentType] || FileText;
            const targetPlatforms = targets
              .map((t) => platformMap.get(t.platformId))
              .filter(Boolean);

            return (
              <Link
                key={post.id}
                href={`/dashboard/posts/${post.id}`}
                className="group flex flex-col rounded-2xl border border-[#e5d9c8] bg-white overflow-hidden hover:border-[#c4b49a] hover:shadow-[0_8px_24px_rgba(23,23,23,0.08)] transition-all"
              >
                {/* Media thumbnail or content type indicator */}
                {post.mediaUrl ? (
                  <div className="aspect-[4/3] bg-[#f5f0e6] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.mediaUrl}
                      alt=""
                      className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#f5f0e6] to-[#ede4d4] flex items-center justify-center">
                    <ContentIcon className="h-10 w-10 text-[#c4b49a]" />
                  </div>
                )}

                {/* Card body */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm text-[#171717] line-clamp-1 group-hover:text-[#4a3f2f]">
                      {post.title || "Untitled Post"}
                    </h3>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        STATUS_COLORS[post.status] || STATUS_COLORS.draft
                      }`}
                    >
                      {post.status === "partial_failure" ? "partial" : post.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#8d7c64] line-clamp-2 leading-relaxed mb-3">
                    {post.content}
                  </p>

                  {/* Platform dots */}
                  {targetPlatforms.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3">
                      {targetPlatforms.map((p) => (
                        <span
                          key={p!.id}
                          title={p!.name}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-white text-[8px] font-bold"
                          style={{ backgroundColor: PLATFORM_COLORS[p!.type] || "#666" }}
                        >
                          {p!.type.charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Date */}
                  <p className="text-[11px] text-[#a89a84]">
                    {post.publishedAt
                      ? `Published ${formatDate(post.publishedAt)}`
                      : post.scheduledAt
                        ? `Scheduled ${formatDate(post.scheduledAt)}`
                        : `Created ${formatDate(post.createdAt)}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
