import { db } from "@/db";
import { profiles } from "@/db/schema";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function ProfilesPage() {
  const allProfiles = await db.select().from(profiles);

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Profiles</h1>
            <p className="text-sm text-gray-500 mt-2">
              Manage your brand identities and voice settings
            </p>
          </div>
          <Link
            href="/dashboard/profiles/new"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Add Profile
          </Link>
        </div>

        {/* Profiles Table */}
        {allProfiles.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-600">
              No profiles yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Name
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Tone
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Voice ID
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Face ID
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Default
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allProfiles.map((profile) => (
                  <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {profile.name}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {profile.tone || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500 font-mono">
                        {profile.voiceId
                          ? `${profile.voiceId.substring(0, 8)}…`
                          : "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500 font-mono">
                        {profile.faceId
                          ? `${profile.faceId.substring(0, 8)}…`
                          : "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      {profile.isDefault ? (
                        <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/profiles/${profile.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
