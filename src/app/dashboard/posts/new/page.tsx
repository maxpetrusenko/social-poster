import { db } from "@/db";
import { profiles, platforms } from "@/db/schema";
import { NewPostForm } from "@/components/new-post-form";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function NewPostPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const allProfiles = await db.select().from(profiles);
  const allPlatforms = await db.select().from(platforms);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Create Post</h1>
        <p className="text-sm text-gray-600 mt-1">
          Create a new post to schedule across your platforms
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-8">
        <NewPostForm profiles={allProfiles} platforms={allPlatforms} />
      </div>
    </div>
  );
}
