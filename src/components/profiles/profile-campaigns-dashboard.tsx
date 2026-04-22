"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, FolderKanban, Loader2, Plus, Save, UserCircle } from "lucide-react";
import {
  CampaignEditor,
  campaignFromDetail,
  parseCampaign,
  serializeCampaign,
  type CampaignDetail,
} from "./profile-campaign-editor";
import {
  CAMPAIGNS_PATH,
  campaignEntries,
  childPath,
  defaultCampaignContent,
  normalizeWorkspace,
  sanitizeName,
  serializeWorkspace,
  uniquePath,
  type Profile,
  type WorkspaceTree,
} from "./profile-workspace-config";

type ConnectedPlatform = {
  id: string;
  type: string;
  name: string;
  handle: string | null;
  enabled: boolean;
};

type CampaignSummary = {
  path: string;
  title: string;
  status: string;
  profile: Profile;
  tree: WorkspaceTree;
  content: string;
  campaignId: string | null;
  campaignRecord: CampaignDetail | null;
};

export function ProfileCampaignsDashboard({
  initialProfiles,
  initialPlatforms,
  initialCampaigns,
  initialCampaignRecords,
}: {
  initialProfiles: Profile[];
  initialPlatforms: ConnectedPlatform[];
  initialCampaigns?: CampaignDetail[];
  initialCampaignRecords?: CampaignDetail[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [campaignRecords, setCampaignRecords] = useState(initialCampaignRecords ?? initialCampaigns ?? []);
  const [activeProfileId, setActiveProfileId] = useState(initialProfiles[0]?.id ?? "");
  const [activeCampaignPath, setActiveCampaignPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campaignRecordsById = useMemo(
    () => new Map(campaignRecords.map((campaign) => [campaign.id, campaign] as const)),
    [campaignRecords]
  );
  const campaigns = useMemo(() => collectCampaigns(profiles, campaignRecordsById), [profiles, campaignRecordsById]);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
  const visibleCampaigns = campaigns.filter((campaign) => campaign.profile.id === activeProfile?.id);
  const activeCampaign =
    visibleCampaigns.find((campaign) => campaign.path === activeCampaignPath) ??
    visibleCampaigns[0] ??
    null;

  function upsertCampaignRecord(nextCampaign: CampaignDetail | null) {
    if (!nextCampaign) return;
    setCampaignRecords((current) => {
      const index = current.findIndex((campaign) => campaign.id === nextCampaign.id);
      if (index === -1) return [nextCampaign, ...current];
      const next = current.slice();
      next[index] = nextCampaign;
      return next;
    });
  }

  function updateCampaign(nextValue: string) {
    if (!activeCampaign) return;
    setSaved(false);
    setError(null);
    setProfiles((current) =>
      current.map((profile) => {
        if (profile.id !== activeCampaign.profile.id) return profile;
        const workspace = normalizeWorkspace(profile);
        return {
          ...profile,
          config: {
            ...(profile.config ?? {}),
            profileWorkspace: serializeWorkspace(
              {
                ...workspace.tree,
                [activeCampaign.path]: {
                  ...workspace.tree[activeCampaign.path],
                  type: "file",
                  content: nextValue,
                },
              },
              activeCampaign.path
            ),
          },
        };
      })
    );
  }

  async function createCampaign(nameInput?: string) {
    if (!activeProfile) return;
    const input = nameInput ?? window.prompt("Campaign name", "New campaign");
    if (!input) return;

    const workspace = normalizeWorkspace(activeProfile);
    const folderName = sanitizeName(input, "new-campaign", false).toLowerCase();
    const folderPath = uniquePath(workspace.tree, childPath(CAMPAIGNS_PATH, folderName));
    const filePath = childPath(folderPath, "campaign.md");
    const campaignContent = defaultCampaignContent(activeProfile, input);
    const draftCampaign = parseCampaign(campaignContent, activeProfile);
    const nextTree: WorkspaceTree = {
      ...workspace.tree,
      platforms: workspace.tree.platforms ?? { type: "folder" },
      [CAMPAIGNS_PATH]: workspace.tree[CAMPAIGNS_PATH] ?? { type: "folder", system: true },
      [folderPath]: { type: "folder" },
      [filePath]: { type: "file", content: campaignContent },
    };

    setSaved(false);
    setError(null);
    setActiveCampaignPath(filePath);
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === activeProfile.id
          ? {
              ...profile,
              config: {
                ...(profile.config ?? {}),
                profileWorkspace: serializeWorkspace(nextTree, filePath),
              },
            }
          : profile
      )
    );

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: activeProfile.id,
          name: draftCampaign.title,
          brief: draftCampaign.description,
          objective: draftCampaign.visualPrompt,
          selectedPlatforms: initialPlatforms.filter((platform) => platform.enabled).map((platform) => platform.id),
        }),
      });

      const data = (await response.json().catch(() => null)) as { campaign?: CampaignDetail; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create campaign");
      }

      if (data?.campaign) {
        upsertCampaignRecord(data.campaign);
        const linkedCampaign = campaignFromDetail(data.campaign, draftCampaign);
        const linkedContent = serializeCampaign(linkedCampaign, campaignContent);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === activeProfile.id
              ? {
                  ...profile,
                  config: {
                    ...(profile.config ?? {}),
                    profileWorkspace: serializeWorkspace(
                      {
                        ...workspace.tree,
                        platforms: workspace.tree.platforms ?? { type: "folder" },
                        [CAMPAIGNS_PATH]: workspace.tree[CAMPAIGNS_PATH] ?? { type: "folder", system: true },
                        [folderPath]: { type: "folder" },
                        [filePath]: { type: "file", content: linkedContent },
                      },
                      filePath
                    ),
                  },
                }
              : profile
          )
        );
        await persistProfileWorkspace(activeProfile, {
          ...workspace.tree,
          platforms: workspace.tree.platforms ?? { type: "folder" },
          [CAMPAIGNS_PATH]: workspace.tree[CAMPAIGNS_PATH] ?? { type: "folder", system: true },
          [folderPath]: { type: "folder" },
          [filePath]: { type: "file", content: linkedContent },
        }, filePath);
        setSaved(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create campaign");
    }
  }

  async function saveActiveProfile() {
    if (!activeProfile) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch(`/api/profiles/${activeProfile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeProfile),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to save campaign");
      }
      const updated = (await response.json()) as Profile;
      setProfiles((current) => current.map((profile) => (profile.id === updated.id ? updated : profile)));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 xl:px-10">
        <div className="rounded-[24px] border border-[#d9cab5] bg-white p-8 text-center">
          <UserCircle className="mx-auto h-10 w-10 text-[#7f6c54]" />
          <h1 className="mt-4 text-2xl font-semibold text-[#171717]">Create a profile first</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6f604b]">
            Campaigns use profile DNA, website notes, tone, assets, and platform rules. Without a profile there is nothing useful to generate from.
          </p>
          <Link
            href="/dashboard/profiles/new"
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-[#171717] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 md:px-6 xl:px-8">
      <div className="overflow-hidden rounded-[28px] border border-[#303328] bg-[#17191a] text-[#e7ead7] shadow-[0_28px_90px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2a2d25] bg-[#1d1f20] px-5 py-4">
        <div className="min-w-[280px] max-w-[360px] flex-1">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8b97b]">Profile</span>
            <select
              value={activeProfile?.id ?? ""}
              onChange={(event) => {
                setActiveProfileId(event.target.value);
                setActiveCampaignPath("");
                setSaved(false);
                setError(null);
              }}
              className="mt-1 w-full rounded-[12px] border border-[#45483c] bg-[#121415] px-3 py-2.5 text-sm font-semibold text-[#f1f3e8] outline-none focus:border-[#bacb84]"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#4f6044] bg-[#202719] px-3 py-2 text-xs font-semibold text-[#c7dc88]">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void createCampaign()}
            className="inline-flex items-center gap-2 rounded-[12px] border border-[#565a4a] bg-[#242726] px-4 py-2.5 text-sm font-semibold text-[#e7ead7] hover:border-[#bacb84]"
          >
            <Plus className="h-4 w-4" />
            Campaign for profile
          </button>
          <button
            type="button"
            onClick={saveActiveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[12px] bg-[#c5d887] px-4 py-2.5 text-sm font-semibold text-[#17191a] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
        </div>

      {error ? (
        <div className="mx-5 mt-4 rounded-[12px] border border-[#6f392e] bg-[#2a1715] px-4 py-3 text-sm font-medium text-[#ffb19e]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-[#2a2d25] bg-[#1c1f1f] p-4">
          <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-[#f1f3e8]">
            <FolderKanban className="h-4 w-4" />
            {activeProfile?.name} campaigns
          </div>
          <div className="mt-2 space-y-1">
            {visibleCampaigns.length === 0 ? (
              <p className="rounded-[12px] bg-[#242726] px-3 py-3 text-sm leading-6 text-[#a8aa9e]">
                No campaigns yet.
              </p>
            ) : (
              visibleCampaigns.map((campaign) => (
                <button
                  key={campaign.path}
                  type="button"
                  onClick={() => setActiveCampaignPath(campaign.path)}
                  className={`w-full rounded-[12px] px-3 py-3 text-left transition ${
                    campaign.path === activeCampaign?.path
                      ? "bg-[#c5d887] text-[#17191a]"
                      : "text-[#d8dacd] hover:bg-[#242726]"
                  }`}
                >
                  <span className="block truncate text-sm font-semibold">{campaign.title}</span>
                  <span className="mt-1 block text-xs opacity-70">
                    {campaign.status}
                    {campaign.campaignId ? ` · ${campaign.campaignId.slice(0, 8)}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section>
          {activeCampaign ? (
            <CampaignEditor
              key={`${activeCampaign.profile.id}:${activeCampaign.path}:${activeCampaign.campaignId || "local"}`}
              profile={activeCampaign.profile}
              platforms={initialPlatforms}
              value={activeCampaign.content}
              onChange={updateCampaign}
              campaignId={activeCampaign.campaignId}
              campaignRecord={activeCampaign.campaignRecord}
              onCampaignRecordChange={upsertCampaignRecord}
            />
          ) : (
            <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
              <div>
              <FolderKanban className="mx-auto h-10 w-10 text-[#a8b97b]" />
              <h2 className="mt-4 font-serif text-3xl font-semibold text-[#f1f3e8]">No campaign selected</h2>
              <p className="mt-2 text-sm text-[#a8aa9e]">Create one and it will open in the campaign studio.</p>
              <button
                type="button"
                onClick={() => void createCampaign("New campaign")}
                className="mt-5 inline-flex items-center gap-2 rounded-[999px] bg-[#c5d887] px-5 py-3 text-sm font-semibold text-[#17191a]"
              >
                <Plus className="h-4 w-4" />
                Create campaign
              </button>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

function collectCampaigns(profiles: Profile[], campaignRecordsById: Map<string, CampaignDetail>): CampaignSummary[] {
  return profiles.flatMap((profile) => {
    const workspace = normalizeWorkspace(profile);
    const entries = campaignEntries(workspace.tree).map(({ path, node }) => {
      const content = node.content ?? "";
      const parsed = parseCampaign(content, profile);
      const campaignRecord = resolveCampaignRecord(parsed, profile.id, campaignRecordsById);
      const campaignData = campaignRecord ? campaignFromDetail(campaignRecord, parsed) : parsed;
      return {
        path,
        title: campaignData.title,
        status: campaignData.status,
        profile,
        tree: workspace.tree,
        content,
        campaignId: campaignData.campaignId || null,
        campaignRecord,
      };
    });
    const seenIds = new Set(entries.map((entry) => entry.campaignId).filter(Boolean));
    const virtualEntries = Array.from(campaignRecordsById.values())
      .filter((record) => record.profileId === profile.id && !seenIds.has(record.id))
      .map((record) => {
        const path = uniquePath(workspace.tree, childPath(CAMPAIGNS_PATH, `${slugify(record.name)}/campaign.md`));
        const fallback = parseCampaign(defaultCampaignContent(profile, record.name), profile);
        const campaignData = campaignFromDetail(record, fallback);
        const content = serializeCampaign(campaignData, defaultCampaignContent(profile, record.name));
        return {
          path,
          title: campaignData.title,
          status: campaignData.status,
          profile,
          tree: workspace.tree,
          content,
          campaignId: record.id,
          campaignRecord: record,
        };
      });
    return [...entries, ...virtualEntries];
  });
}

function resolveCampaignRecord(
  campaign: ReturnType<typeof parseCampaign>,
  profileId: string,
  campaignRecordsById: Map<string, CampaignDetail>
) {
  if (campaign.campaignId && campaignRecordsById.has(campaign.campaignId)) {
    return campaignRecordsById.get(campaign.campaignId) ?? null;
  }

  const normalizedTitle = normalizeName(campaign.title);
  for (const record of campaignRecordsById.values()) {
    if (record.profileId !== profileId) continue;
    if (normalizeName(record.name) !== normalizedTitle) continue;
    return record;
  }

  return null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "campaign"
  );
}

async function persistProfileWorkspace(profile: Profile, tree: WorkspaceTree, activePath: string) {
  const response = await fetch(`/api/profiles/${profile.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...profile,
      config: {
        ...(profile.config ?? {}),
        profileWorkspace: serializeWorkspace(tree, activePath),
      },
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to save profile campaign file");
  }
}
