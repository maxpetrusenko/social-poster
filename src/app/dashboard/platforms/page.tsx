import { db } from "@/db";
import { platforms } from "@/db/schema";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { getPlatformSkills } from "@/lib/platforms";

export default async function PlatformsPage() {
  const allPlatforms = await db.select().from(platforms);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Platforms</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage connected social media accounts
            </p>
          </div>
          <Link
            href="/dashboard/platforms/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Platform
          </Link>
        </div>

        {/* Platforms List */}
        {allPlatforms.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-sm mb-4">
              No platforms connected yet
            </p>
            <Link
              href="/dashboard/platforms/new"
              className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
            >
              Connect your first platform
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {allPlatforms.map((platform) => {
              const skills = getPlatformSkills(platform.config);

              return (
                <Link
                  key={platform.id}
                  href={`/dashboard/platforms/${platform.id}`}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900 group-hover:text-indigo-600">
                          {platform.name}
                        </h3>
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            platform.enabled ? "bg-green-500" : "bg-gray-300"
                          }`}
                        />
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          {platform.type}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-2">
                        {platform.handle && (
                          <p>
                            <span className="text-gray-500">Handle:</span>{" "}
                            {platform.handle}
                          </p>
                        )}
                        <p>
                          <span className="text-gray-500">Provider:</span>{" "}
                          {platform.provider}
                        </p>
                        {platform.accountId && (
                          <p>
                            <span className="text-gray-500">Account ID:</span>{" "}
                            {platform.accountId}
                          </p>
                        )}
                        {skills.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {skills.slice(0, 4).map((skill) => (
                              <span
                                key={`${platform.id}-${skill}`}
                                className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
