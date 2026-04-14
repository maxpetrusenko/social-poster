"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Eye, PauseCircle, PlayCircle, Plus, Unplug } from "lucide-react";
import {
  CONNECTION_PLATFORM_DEFINITIONS,
  getConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import { PlatformChip } from "./ui";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import {
  readStoredConnectionConfig,
  summarizeCredentialState,
} from "@/lib/connection-config";
import type {
  FormState,
  PlatformInsight,
  PlatformRow,
  ProfileRow,
} from "./connections-types";
import { ConnectionsDrawer } from "./connections-drawer";
import type { PlatformType } from "@/lib/platforms";

export function ConnectionsPage({
  profiles,
  platforms,
  insights,
  initialDrawerOpen,
  initialPlatformType,
}: {
  profiles: ProfileRow[];
  platforms: PlatformRow[];
  insights: PlatformInsight[];
  initialDrawerOpen: boolean;
  initialPlatformType: PlatformType | null;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [selectedPlatformType, setSelectedPlatformType] = useState<PlatformType>(
    initialPlatformType ?? CONNECTION_PLATFORM_DEFINITIONS[0].type
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [formState, setFormState] = useState<FormState>({
    useInstalledBirdSession: true,
    threadLongPosts: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const insightById = useMemo(
    () => new Map(insights.map((item) => [item.id, item])),
    [insights]
  );

  const profileNameById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.name])),
    [profiles]
  );

  const selectedDefinition =
    getConnectionPlatformDefinition(selectedPlatformType) ??
    CONNECTION_PLATFORM_DEFINITIONS[0];

  const selectedMethod =
    selectedDefinition.methods.find((item) => item.id === selectedMethodId) ??
    selectedDefinition.methods[0];

  const filteredPlatforms = useMemo(() => {
    return platforms.filter((platform) => {
      if (selectedStatus === "enabled" && !platform.enabled) {
        return false;
      }

      if (selectedStatus === "disabled" && platform.enabled) {
        return false;
      }

      if (selectedProfileId === "all") {
        return true;
      }

      const stored = summarizeCredentialState(platform.config);
      return stored.profileId === selectedProfileId;
    });
  }, [platforms, selectedProfileId, selectedStatus]);

  const totals = useMemo(() => {
    const connected = platforms.length;
    const enabled = platforms.filter((platform) => platform.enabled).length;
    const deliveries = insights.reduce(
      (sum, item) => sum + item.deliveryCount30d,
      0
    );
    const errors = insights.reduce((sum, item) => sum + item.failureCount30d, 0);
    return { connected, enabled, deliveries, errors };
  }, [insights, platforms]);

  function openDrawer(platformType?: PlatformType) {
    setDrawerOpen(true);
    if (platformType) {
      setSelectedPlatformType(platformType);
      setSelectedMethodId(null);
    }
    setError(null);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setError(null);
  }

  function updateField(id: string, value: string | boolean) {
    setFormState((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function resetFormForPlatform(platformType: PlatformType) {
    setSelectedPlatformType(platformType);
    setSelectedMethodId(null);
    setFormState({
      useInstalledBirdSession: true,
      threadLongPosts: true,
    });
    setError(null);
  }

  async function handleCreateConnection() {
    const credentials: Record<string, string | boolean> = {};

    for (const field of selectedMethod.fields) {
      if (
        field.id === "displayName" ||
        field.id === "handle" ||
        field.id === "providerAccountId" ||
        field.id === "customInstructions"
      ) {
        continue;
      }

      const rawValue = formState[field.id];
      if (typeof rawValue === "boolean") {
        credentials[field.id] = rawValue;
      } else if (typeof rawValue === "string" && rawValue.trim()) {
        credentials[field.id] = rawValue.trim();
      }
    }

    const payload = {
      name:
        String(formState.displayName || "").trim() ||
        `${selectedDefinition.label} Connection`,
      type: selectedDefinition.type,
      handle: String(formState.handle || "").trim() || undefined,
      accountId: String(formState.providerAccountId || "").trim() || undefined,
      provider: selectedMethod.provider,
      enabled: true,
      config: {
        profileId:
          selectedProfileId === "all" ? null : selectedProfileId || null,
        authMethod: selectedMethod.id,
        customInstructions:
          String(formState.customInstructions || "").trim() || null,
        credentials,
        docs: selectedMethod.docs.map((item) => item.url),
        notes: selectedMethod.recommendation,
      },
    };

    startSaving(async () => {
      setError(null);

      const response = await fetch("/api/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Failed to create connection.");
        return;
      }

      closeDrawer();
      router.refresh();
    });
  }

  async function handleDisconnect(platformId: string) {
    if (!confirm("Disconnect this connection?")) {
      return;
    }

    setDisconnectingId(platformId);
    try {
      const response = await fetch(`/api/platforms/${platformId}/delete`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect connection.");
      }

      router.refresh();
    } catch (disconnectError) {
      alert(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Failed to disconnect connection."
      );
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleToggleEnabled(platform: PlatformRow) {
    setTogglingId(platform.id);
    try {
      const response = await fetch(`/api/platforms/${platform.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !platform.enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update connection status.");
      }

      router.refresh();
    } catch (toggleError) {
      alert(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update connection status."
      );
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,#0a131d_0%,#101d30_48%,#16263a_100%)] p-6 text-white shadow-[0_24px_72px_rgba(8,17,29,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="section-eyebrow text-[var(--accent-tech)]">
              Connections
            </p>
            <h1 className="mt-3 font-serif text-[2.2rem] leading-none tracking-[0.01em] text-[#edf6ff]">
              Account and platform integrations
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#9db0c3]">
              Connect accounts with direct API credentials, relay provider IDs,
              or custom tool instructions. Disabling a connection keeps past
              posts and schedules intact, but skips that account during publish.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openDrawer()}
              className="inline-flex items-center gap-2 rounded-[14px] bg-white px-4 py-2.5 text-sm font-semibold text-[#09111a] transition hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" />
              New connection
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricBox
            label="Connected"
            value={totals.connected}
            note={`${totals.enabled} enabled`}
          />
          <MetricBox
            label="Deliveries, 30d"
            value={totals.deliveries}
            note="platform-level successes"
          />
          <MetricBox
            label="Errors, 30d"
            value={totals.errors}
            note="platform-level failures"
          />
          <MetricBox
            label="Profiles"
            value={profiles.length}
            note="filter the grid by profile"
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-5 shadow-[0_18px_52px_rgba(12,17,21,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              Connections roster
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choose a profile context, then manage account credentials and
              publishing methods.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-[var(--muted)]">
              Profile
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="ml-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                <option value="all">All profiles</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-[var(--muted)]">
              Status
              <select
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(event.target.value as "all" | "enabled" | "disabled")
                }
                className="ml-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                <option value="all">All statuses</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => openDrawer()}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              <Plus className="h-4 w-4" />
              Connect
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {filteredPlatforms.map((platform) => {
            const definition = getConnectionPlatformDefinition(platform.type);
            const meta = getPlatformMeta(platform.type);
            const insight = insightById.get(platform.id);
            const stored = readStoredConnectionConfig(platform.config);
            const profileName = stored.profileId
              ? profileNameById.get(stored.profileId) ?? "Unknown profile"
              : "No profile";
            const credentialSummary = summarizeCredentialState(platform.config);

            return (
              <article
                key={platform.id}
                className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-5 shadow-[0_12px_36px_rgba(12,17,21,0.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-base font-bold"
                      style={{
                        backgroundColor: `${meta.accent}18`,
                        color: meta.accent,
                        boxShadow: `inset 0 0 0 1px ${meta.accent}22`,
                      }}
                    >
                      {meta.shortLabel}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-[var(--ink)]">
                        {platform.handle || platform.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-[var(--muted)]">
                          {definition?.label ?? platform.name}
                        </p>
                        <span className="rounded-full bg-[rgba(12,17,21,0.05)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          {platform.provider}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      platform.enabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {platform.enabled ? "connected" : "disabled"}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <PlatformChip
                      label={definition?.label ?? platform.name}
                      accent={meta.accent}
                      shortLabel={meta.shortLabel}
                    />
                    <span className="rounded-full bg-[rgba(255,204,102,0.16)] px-2.5 py-1 text-[11px] font-semibold text-[#9a6a00]">
                      {profileName}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoBlock
                      label="Auth"
                      value={formatMethodLabel(credentialSummary.authMethod)}
                    />
                    <InfoBlock
                      label="Credentials"
                      value={`${credentialSummary.filledCredentialCount} fields`}
                    />
                    <InfoBlock
                      label="Schedules"
                      value={`${insight?.scheduleCount ?? 0} attached`}
                    />
                    <InfoBlock
                      label="30d"
                      value={`${insight?.deliveryCount30d ?? 0} sent · ${
                        insight?.failureCount30d ?? 0
                      } failed`}
                    />
                  </div>
                </div>

                {stored.customInstructions ? (
                  <div className="mt-4 rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Instructions
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      {stored.customInstructions}
                    </p>
                  </div>
                ) : null}

                {!platform.enabled ? (
                  <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    This connection stays attached to posts and schedules, but
                    publishing skips it until re-enabled.
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(platform)}
                    disabled={togglingId === platform.id}
                    className={`inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                      platform.enabled
                        ? "border border-amber-200 bg-amber-50 text-amber-800"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {platform.enabled ? (
                      <PauseCircle className="h-4 w-4" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}
                    {togglingId === platform.id
                      ? platform.enabled
                        ? "Disabling..."
                        : "Enabling..."
                      : platform.enabled
                        ? "Disable posting"
                        : "Enable posting"}
                  </button>
                  <Link
                    href={`/dashboard/platforms/${platform.id}`}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                  >
                    <Eye className="h-4 w-4" />
                    Manage
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(platform.id)}
                    disabled={disconnectingId === platform.id}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                  >
                    <Unplug className="h-4 w-4" />
                    {disconnectingId === platform.id ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ConnectionsDrawer
        drawerOpen={drawerOpen}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        selectedPlatformType={selectedPlatformType}
        selectedDefinition={selectedDefinition}
        selectedMethod={selectedMethod}
        formState={formState}
        error={error}
        isSaving={isSaving}
        onClose={closeDrawer}
        onProfileChange={setSelectedProfileId}
        onPlatformChange={resetFormForPlatform}
        onMethodChange={setSelectedMethodId}
        onFieldChange={updateField}
        onSubmit={handleCreateConnection}
      />
    </div>
  );
}

function MetricBox({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8fa5be]">
        {label}
      </p>
      <p className="mt-2 text-[2rem] font-semibold leading-none">{value}</p>
      <p className="mt-2 text-sm text-[#8fa5be]">{note}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function formatMethodLabel(method: string | null | undefined) {
  if (!method) return "Not set";
  return method.replace(/_/g, " ");
}
