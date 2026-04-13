import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  publishing: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  partial_failure: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  text: "bg-slate-100 text-slate-700",
  image: "bg-amber-100 text-amber-700",
  video: "bg-cyan-100 text-cyan-700",
  avatar_video: "bg-pink-100 text-pink-700",
};

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const statusFilter = params.status || "all";

  let allPosts;
  if (statusFilter !== "all") {
    allPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.status, statusFilter))
      .orderBy(posts.createdAt);
  } else {
    allPosts = await db.select().from(posts).orderBy(posts.createdAt);
  }

  const postStatuses = await Promise.all(
    allPosts.map(async (post) => {
      const targets = await db
        .select()
        .from(postTargets)
        .where(eq(postTargets.postId, post.id));
      return { post, targets };
    })
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Posts</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage and schedule your social media posts
          </p>
        </div>
        <Link
          href="/dashboard/posts/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Post
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-200">
        {["all", "draft", "scheduled", "published", "partial_failure", "failed"].map((status) => (
          <Link
            key={status}
            href={
              status === "all"
                ? "/dashboard/posts"
                : `/dashboard/posts?status=${status}`
            }
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === status
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {status === "partial_failure"
              ? "Partial failure"
              : status.charAt(0).toUpperCase() + status.slice(1)}
          </Link>
        ))}
      </div>

      {/* Posts List */}
      {postStatuses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600 text-sm mb-4">
            No posts found
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Legacy social-agent only stored run history. New posts will appear here once this app starts publishing.
          </p>
          <Link
            href="/dashboard/posts/new"
            className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
          >
            Create your first post
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {postStatuses.map(({ post }) => (
            <Link
              key={post.id}
              href={`/dashboard/posts/${post.id}`}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-gray-900 group-hover:text-indigo-600 truncate">
                      {post.title || "Untitled Post"}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        CONTENT_TYPE_COLORS[post.contentType] ||
                        CONTENT_TYPE_COLORS.text
                      }`}
                    >
                      {post.contentType}
                    </span>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        STATUS_COLORS[post.status] || STATUS_COLORS.draft
                      }`}
                    >
                      {post.status}
                    </span>
                    {post.scheduledAt && (
                      <span className="text-xs text-gray-500">
                        Scheduled: {formatDate(post.scheduledAt)}
                      </span>
                    )}
                    {post.publishedAt && (
                      <span className="text-xs text-gray-500">
                        Published: {formatDate(post.publishedAt)}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors flex-shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
