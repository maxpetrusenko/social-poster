"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CONNECTION_PLATFORM_DEFINITIONS,
  getConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import {
  readStoredConnectionConfig,
  summarizeCredentialState,
} from "@/lib/connection-config";
import {
  ConnectionsGrid,
  ConnectionsWorkspaceHeader,
  type ConnectionCardItem,
} from "./connections-page-sections";
import type {
  FormState,
  PlatformInsight,
  PlatformRow,
  ProfileRow,
} from "./connections-types";
import { ConnectionsDrawer } from "./connections-drawer";
import type { PlatformType } from "@/lib/platforms";

export function ConnectionsPage({
  workspaceName,
  organizationName,
  profiles,
  platforms,
  insights,
  initialDrawerOpen,
  initialPlatformType,
}: {
  workspaceName: string;
  organizationName: string;
  profiles: ProfileRow[];
  platforms: PlatformRow[];
  insights: PlatformInsight[];
  initialDrawerOpen: boolean;
  initialPlatformType: PlatformType | null;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [localPlatforms, setLocalPlatforms] = useState(platforms);
  const [selectedPlatformType, setSelectedPlatformType] = useState<PlatformType>(
    initialPlatformType ?? CONNECTION_PLATFORM_DEFINITIONS[0].type
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("all");
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<
    PlatformType | "all"
  >("all");
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

  useEffect(() => {
    setLocalPlatforms(platforms);
  }, [platforms]);

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
    return localPlatforms.filter((platform) => {
      if (selectedStatus === "enabled" && !platform.enabled) {
        return false;
      }

      if (selectedStatus === "disabled" && platform.enabled) {
        return false;
      }

      if (selectedPlatformFilter !== "all" && platform.type !== selectedPlatformFilter) {
        return false;
      }

      if (selectedProfileId === "all") {
        return true;
      }

      const stored = summarizeCredentialState(platform.config);
      return stored.profileId === selectedProfileId;
    });
  }, [localPlatforms, selectedPlatformFilter, selectedProfileId, selectedStatus]);

  const totals = useMemo(() => {
    const connected = localPlatforms.length;
    const enabled = localPlatforms.filter((platform) => platform.enabled).length;
    const deliveries = insights.reduce(
      (sum, item) => sum + item.deliveryCount30d,
      0
    );
    return { connected, enabled, deliveries };
  }, [insights, localPlatforms]);

  const cardItems = useMemo<ConnectionCardItem[]>(() => {
    return filteredPlatforms
      .map((platform) => {
        const definition = getConnectionPlatformDefinition(platform.type);
        const meta = getPlatformMeta(platform.type);
        const insight = insightById.get(platform.id);
        const stored = readStoredConnectionConfig(platform.config);
        const credentialSummary = summarizeCredentialState(platform.config);
        const profileLabel = stored.profileId
          ? profileNameById.get(stored.profileId) ?? "Unknown profile"
          : "No profile";
        const accountLabel = platform.handle || platform.name;
        const secondaryLabel =
          platform.handle && platform.name && platform.name !== platform.handle
            ? platform.name
            : platform.accountId
              ? `Account ID: ${platform.accountId}`
              : null;

        return {
          id: platform.id,
          platformType: platform.type,
          accountLabel,
          secondaryLabel,
          platformLabel: definition?.label ?? platform.name,
          handle: platform.handle,
          accent: meta.accent,
          glow: meta.glow,
          shortLabel: meta.shortLabel,
          providerLabel: formatProviderLabel(platform.provider),
          profileLabel,
          enabled: platform.enabled,
          authLabel: formatMethodLabel(credentialSummary.authMethod),
          credentialCount: credentialSummary.filledCredentialCount,
          scheduleCount: insight?.scheduleCount ?? 0,
          deliveryCount30d: insight?.deliveryCount30d ?? 0,
          failureCount30d: insight?.failureCount30d ?? 0,
          customInstructions: stored.customInstructions ?? null,
          createdAtLabel: null,
          manageLabel: getManageLabel(platform.type),
        };
      })
      .sort((left, right) => {
        if (left.enabled !== right.enabled) {
          return left.enabled ? -1 : 1;
        }

        return left.platformLabel.localeCompare(right.platformLabel);
      });
  }, [filteredPlatforms, insightById, profileNameById]);

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
    const nextEnabled = !platform.enabled;

    setTogglingId(platform.id);
    setLocalPlatforms((currentPlatforms) =>
      currentPlatforms.map((currentPlatform) =>
        currentPlatform.id === platform.id
          ? { ...currentPlatform, enabled: nextEnabled }
          : currentPlatform
      )
    );

    try {
      const response = await fetch(`/api/platforms/${platform.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update connection status.");
      }

      router.refresh();
    } catch (toggleError) {
      setLocalPlatforms((currentPlatforms) =>
        currentPlatforms.map((currentPlatform) =>
          currentPlatform.id === platform.id
            ? { ...currentPlatform, enabled: platform.enabled }
            : currentPlatform
        )
      );
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
    <div className="bg-[radial-gradient(circle_at_top_left,#fff8ef_0%,transparent_32%),linear-gradient(180deg,#f5f0e6_0%,#eee5d7_100%)]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8 xl:px-10">
        <ConnectionsWorkspaceHeader
          workspaceName={workspaceName}
          organizationName={organizationName}
          connectedCount={totals.connected}
          enabledCount={totals.enabled}
          deliveryCount30d={totals.deliveries}
          profileCount={profiles.length}
          selectedProfileId={selectedProfileId}
          selectedPlatformType={selectedPlatformFilter}
          selectedStatus={selectedStatus}
          profiles={profiles}
          onProfileChange={setSelectedProfileId}
          onPlatformChange={setSelectedPlatformFilter}
          onStatusChange={setSelectedStatus}
          onCreateConnection={() =>
            openDrawer(
              selectedPlatformFilter === "all" ? undefined : selectedPlatformFilter
            )
          }
        />

        <ConnectionsGrid
          items={cardItems}
          togglingId={togglingId}
          disconnectingId={disconnectingId}
          onToggle={(platformId) => {
            const platform = platforms.find((item) => item.id === platformId);
            if (platform) handleToggleEnabled(platform);
          }}
          onDisconnect={handleDisconnect}
        />
      </div>

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

function formatMethodLabel(method: string | null | undefined) {
  if (!method) return "Not set";
  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatProviderLabel(provider: PlatformRow["provider"]) {
  return {
    direct: "Direct",
    bird: "Bird",
    zernio: "Relay",
  }[provider];
}

function getManageLabel(platformType: PlatformType) {
  return {
    facebook: "Manage Pages",
    instagram: "Manage Account",
    linkedin: "Manage Account",
    pinterest: "Manage Boards",
    reddit: "Manage Subreddit",
    tiktok: "Manage Account",
    twitter: "Manage Account",
    youtube: "Manage Channel",
  }[platformType];
}
