import { db } from "@/db";
import { profiles } from "@/db/schema";
import Link from "next/link";
import { ArrowUpRight, Mic2, PenLine, Plus, ScanFace, UserCircle } from "lucide-react";
import {
  DashboardHero,
  DashboardPageContent,
  HeroButton,
  MetricCard,
  SectionCard,
} from "@/components/dashboard/ui";
import { getTenantContext } from "@/lib/tenancy";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const allProfiles = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workspaceId, tenant.currentWorkspace.id));
  const sortedProfiles = [...allProfiles].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
  const defaultProfile = allProfiles.find((profile) => profile.isDefault);
  const voiceCount = allProfiles.filter((profile) => profile.voiceId).length;
  const faceCount = allProfiles.filter((profile) => profile.faceId).length;

  return (
    <DashboardPageContent>
      <DashboardHero
        eyebrow="Profiles"
        title="Voice and identity presets"
        description="Manage the brand voices, face IDs, tones, and reusable profile workspaces used by campaigns and scheduled content."
        actions={
          <>
            <HeroButton href="/dashboard/campaigns" tone="ghost">
              Campaigns
            </HeroButton>
            <HeroButton href="/dashboard/profiles/new">Add profile</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Profiles"
          value={allProfiles.length}
          sub={defaultProfile ? `Default: ${defaultProfile.name}` : "No default selected"}
        />
        <MetricCard
          label="Voice IDs"
          value={voiceCount}
          sub="Cartesia-ready identities"
          accent="var(--accent-mindfold)"
        />
        <MetricCard
          label="Face IDs"
          value={faceCount}
          sub="Simli-ready identities"
          accent="var(--accent-spirit)"
        />
      </div>

      <SectionCard
        title="Profile library"
        subtitle="Edit persona details or open the workspace for campaign knowledge."
        action={
          <Link
            href="/dashboard/profiles/new"
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--sand)]"
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        }
      >
        {sortedProfiles.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[rgba(12,17,21,0.16)] bg-[var(--paper)] px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--muted)]">
              <UserCircle className="h-5 w-5" />
            </div>
            <p className="mt-4 font-serif text-[1.5rem] text-[var(--ink)]">
              No profiles yet
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Create a profile before building campaigns or recurring content.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {sortedProfiles.map((profile) => (
              <article
                key={profile.id}
                className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-serif text-[1.45rem] leading-none text-[var(--ink)]">
                        {profile.name}
                      </h2>
                      {profile.isDefault ? (
                        <span className="rounded-full border border-[#c5ddbc] bg-[#edf8e9] px-2.5 py-1 text-xs font-semibold text-[#397227]">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {profile.bio?.trim() || "No bio saved for this profile yet."}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/profiles/${profile.id}`}
                    aria-label={`Open ${profile.name}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[rgba(12,17,21,0.08)] bg-white text-[var(--ink)]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <ProfileFact
                    icon={<PenLine className="h-4 w-4" />}
                    label="Tone"
                    value={profile.tone || "Unset"}
                  />
                  <ProfileFact
                    icon={<Mic2 className="h-4 w-4" />}
                    label="Voice"
                    value={formatIdentifier(profile.voiceId)}
                  />
                  <ProfileFact
                    icon={<ScanFace className="h-4 w-4" />}
                    label="Face"
                    value={formatIdentifier(profile.faceId)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </DashboardPageContent>
  );
}

function ProfileFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white/75 px-3 py-3">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

function formatIdentifier(value: string | null) {
  if (!value) return "Unset";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}
