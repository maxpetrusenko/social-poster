import { db } from "@/db";
import { posts, postTargets, platforms, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Trash2, ExternalLink } from "lucide-react";
import { PostDeleteButton } from "@/components/post-delete-button";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  publishing: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  text: "bg-slate-100 text-slate-700",
  image: "bg-amber-100 text-amber-700",
  video: "bg-cyan-100 text-cyan-700",
  avatar_video: "bg-pink-100 text-pink-700",
};

const TARGET_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  publishing: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-yellow-100 text-yellow-700",
};

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, id),
  });

  if (!post) {
    notFound();
  }

  const targets = await db
    .select()
    .from(postTargets)
    .where(eq(postTargets.postId, id));

  const targetPlatforms = await Promise.all(
    targets.map(async (target) => {
      const platform = await db.query.platforms.findFirst({
        where: eq(platforms.id, target.platformId),
      });
      return { target, platform };
    })
  );

  const profile = post.profileId
    ? await db.query.profiles.findFirst({
        where: eq(profiles.id, post.profileId),
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <Link
        href="/dashboard/posts"
        className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Posts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            {post.title || "Untitled Post"}
          </h1>
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
          </div>
        </div>
        <PostDeleteButton postId={post.id} />
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Content</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {post.content}
        </p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Left Column */}
        <div className="space-y-6">
          {profile && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Profile
              </h3>
              <p className="text-sm text-gray-700">{profile.name}</p>
              {profile.tone && (
                <p className="text-xs text-gray-600 mt-1">
                  Tone: <span className="font-medium">{profile.tone}</span>
                </p>
              )}
            </div>
          )}

          {post.sourceUrl && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Source
              </h3>
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-2 break-all"
              >
                {post.sourceTitle || post.sourceUrl}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Dates
            </h3>
            <div className="space-y-2 text-xs text-gray-600">
              {post.scheduledAt && (
                <p>
                  <span className="text-gray-500">Scheduled:</span>{" "}
                  {formatDate(post.scheduledAt)}
                </p>
              )}
              {post.publishedAt && (
                <p>
                  <span className="text-gray-500">Published:</span>{" "}
                  {formatDate(post.publishedAt)}
                </p>
              )}
              <p>
                <span className="text-gray-500">Created:</span>{" "}
                {formatDate(post.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Platform Targets
          </h3>
          {targetPlatforms.length === 0 ? (
            <p className="text-sm text-gray-600">No platforms targeted</p>
          ) : (
            <div className="space-y-3">
              {targetPlatforms.map(({ target, platform }) => (
                <div key={target.id} className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {platform?.name || "Unknown"}
                    </p>
                    {target.publishedUrl && (
                      <a
                        href={target.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-1"
                      >
                        View post
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {target.error && (
                      <p className="text-xs text-red-600 mt-1">{target.error}</p>
                    )}
                  </div>
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${
                      TARGET_STATUS_COLORS[target.status] ||
                      TARGET_STATUS_COLORS.pending
                    }`}
                  >
                    {target.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Button */}
      {post.status === "draft" && (
        <Link
          href={`/dashboard/posts/${post.id}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Edit Post
        </Link>
      )}
    </div>
  );
}
