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
  type ConnectionViewMode,
} from "./connections-page-sections";
import type {
  FormState,
  PlatformInsight,
  PlatformRow,
  ProfileRow,
} from "./connections-types";
import { ConnectionsDrawer } from "./connections-drawer";
import type { PlatformType } from "@/lib/platforms";
import type { NativeConnectionAvailability } from "@/lib/providers/env-availability";
import {
  formatMethodLabel,
  formatProviderLabel,
  getAvailableMethodModes,
  getConnectionMethodMode,
  getDrawerPlatformForConnectionFilter,
  getManageLabel,
  platformMatchesConnectionFilter,
} from "./connections-page-utils";
export function ConnectionsPage({
  workspaceName,
  profiles,
  platforms,
  insights,
  initialDrawerOpen,
  initialPlatformType,
  initialError,
  nativeAvailabilityByPlatform,
  oauthCallbackUrlOverride,
}: {
  workspaceName: string;
  profiles: ProfileRow[];
  platforms: PlatformRow[];
  insights: PlatformInsight[];
  initialDrawerOpen: boolean;
  initialPlatformType: PlatformType | null;
  initialError: string | null;
  nativeAvailabilityByPlatform: Record<PlatformType, NativeConnectionAvailability>;
  oauthCallbackUrlOverride: string | null;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [localPlatforms, setLocalPlatforms] = useState(platforms);
  const [selectedPlatformType, setSelectedPlatformType] = useState<PlatformType>(
    initialPlatformType ?? CONNECTION_PLATFORM_DEFINITIONS[0].type
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [requestedMethodMode, setRequestedMethodMode] = useState<
    "native" | "proxy"
  >("native");
  const [selectedViewMode, setSelectedViewMode] =
    useState<ConnectionViewMode>("native");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("all");
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<
    PlatformType | "all"
  >("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [formState, setFormState] = useState<FormState>({
    useInstalledBirdSession: true,
    threadLongPosts: true,
  });
  const [error, setError] = useState<string | null>(initialError);
  const [isSaving, startSaving] = useTransition();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [checkingBirdId, setCheckingBirdId] = useState<string | null>(null);
  const [reconnectingBirdId, setReconnectingBirdId] = useState<string | null>(null);

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

  const availableMethodModes = getAvailableMethodModes(selectedDefinition.methods);
  const selectedMethodMode = availableMethodModes.includes(requestedMethodMode)
    ? requestedMethodMode
    : availableMethodModes[0] ?? "native";
  const methodsForMode = selectedDefinition.methods.filter(
    (method) => getConnectionMethodMode(method) === selectedMethodMode
  );
  const selectedMethod =
    methodsForMode.find((item) => item.id === selectedMethodId) ??
    methodsForMode[0] ??
    selectedDefinition.methods[0];

  const filteredPlatforms = useMemo(() => {
    return localPlatforms.filter((platform) => {
      const isProxyConnection =
        platform.provider === "zernio" || platform.provider === "bird";

      if (selectedViewMode === "native" && isProxyConnection) {
        return false;
      }

      if (selectedViewMode === "proxy" && !isProxyConnection) {
        return false;
      }

      if (selectedStatus === "enabled" && !platform.enabled) {
        return false;
      }

      if (selectedStatus === "disabled" && platform.enabled) {
        return false;
      }

      if (!platformMatchesConnectionFilter(platform.type, selectedPlatformFilter)) {
        return false;
      }

      if (selectedProfileId === "all") {
        return true;
      }

      const stored = summarizeCredentialState(platform.config);
      return stored.profileId === selectedProfileId;
    });
  }, [
    localPlatforms,
    selectedPlatformFilter,
    selectedProfileId,
    selectedStatus,
    selectedViewMode,
  ]);

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
          avatarUrl: getConnectionAvatarUrl(platform.config),
          platformLabel: definition?.label ?? platform.name,
          handle: platform.handle,
          provider: platform.provider,
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
          birdSession:
            platform.provider === "bird"
              ? formatBirdSessionStatus(stored.birdSession)
              : null,
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
      setRequestedMethodMode(selectedViewMode);
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
    setRequestedMethodMode("native");
    setFormState({
      useInstalledBirdSession: true,
      threadLongPosts: true,
    });
    setError(null);
  }

  async function startOAuthConnection(
    platformType: PlatformType,
    methodId: string,
    credentials?: { clientId?: string; clientSecret?: string }
  ) {
    const definition = getConnectionPlatformDefinition(platformType);
    const method = definition?.methods.find((item) => item.id === methodId);

    if (!definition || !method || method.authType !== "oauth") {
      setDrawerOpen(true);
      setSelectedPlatformType(platformType);
      setSelectedMethodId(methodId);
      setRequestedMethodMode("native");
      setError("This connection method does not support OAuth.");
      return;
    }

    const nativeAvailability = nativeAvailabilityByPlatform[platformType];

    if (
      nativeAvailability &&
      !nativeAvailability.configured &&
      (!credentials?.clientId || !credentials?.clientSecret)
    ) {
      setDrawerOpen(true);
      setSelectedPlatformType(platformType);
      setSelectedMethodId(methodId);
      setRequestedMethodMode("native");
      setError(`Deactivated: configure ${nativeAvailability.missing.join("; ")}.`);
      return;
    }

    const params = new URLSearchParams({
      methodId,
      next: "/dashboard/workspace-settings/social-accounts",
    });
    if (selectedProfileId !== "all") {
      params.set("profileId", selectedProfileId);
    }

    if (credentials?.clientId && credentials.clientSecret) {
      const response = await fetch(
        getOAuthStartUrl(platformType, params, oauthCallbackUrlOverride),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        }
      );
      const body = (await response.json().catch(() => ({}))) as {
        authUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.authUrl) {
        setError(body.error ?? "Failed to start OAuth.");
        return;
      }
      window.location.href = body.authUrl;
      return;
    }

    window.location.href = getOAuthStartUrl(
      platformType,
      params,
      oauthCallbackUrlOverride
    );
  }

  async function handleCreateConnection() {
    if (selectedMethod.authType === "oauth") {
      startOAuthConnection(selectedDefinition.type, selectedMethod.id);
      return;
    }

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

  async function handleCheckBirdSession(platformId: string) {
    setCheckingBirdId(platformId);

    try {
      const response = await fetch(`/api/platforms/${platformId}/test`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Bird session check failed.");
      }

      router.refresh();
    } catch (checkError) {
      router.refresh();
      alert(
        checkError instanceof Error
          ? checkError.message
          : "Bird session check failed."
      );
    } finally {
      setCheckingBirdId(null);
    }
  }

  async function handleReconnectBird(platformId: string, authToken: string, ct0: string) {
    setReconnectingBirdId(platformId);

    try {
      const response = await fetch(`/api/platforms/${platformId}/reconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken, ct0 }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        alert(body.error ?? "Reconnect failed — cookies may be invalid.");
      }

      router.refresh();
    } catch (reconnectError) {
      alert(
        reconnectError instanceof Error
          ? reconnectError.message
          : "Reconnect failed."
      );
    } finally {
      setReconnectingBirdId(null);
    }
  }

  return (
    <div className="bg-[radial-gradient(circle_at_top_left,#fff8ef_0%,transparent_32%),linear-gradient(180deg,#f5f0e6_0%,#eee5d7_100%)]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8 xl:px-10">
        <ConnectionsWorkspaceHeader
          workspaceName={workspaceName}
          selectedProfileId={selectedProfileId}
          selectedPlatformType={selectedPlatformFilter}
          selectedStatus={selectedStatus}
          selectedViewMode={selectedViewMode}
          profiles={profiles}
          onProfileChange={setSelectedProfileId}
          onPlatformChange={setSelectedPlatformFilter}
          onStatusChange={setSelectedStatus}
          onViewModeChange={(mode) => {
            setSelectedViewMode(mode);
            setRequestedMethodMode(mode);
          }}
          onCreateConnection={() =>
            openDrawer(
              getDrawerPlatformForConnectionFilter(
                selectedPlatformFilter,
                selectedViewMode
              )
            )
          }
        />

        {error ? (
          <div
            role="alert"
            className="rounded-[14px] border border-[#e5c7ba] bg-[#f8e8e1] px-4 py-3 text-sm font-semibold text-[#9a5947]"
          >
            {error}
          </div>
        ) : null}

        <ConnectionsGrid
          items={cardItems}
          togglingId={togglingId}
          disconnectingId={disconnectingId}
          checkingBirdId={checkingBirdId}
          reconnectingBirdId={reconnectingBirdId}
          onToggle={(platformId) => {
            const platform = platforms.find((item) => item.id === platformId);
            if (platform) handleToggleEnabled(platform);
          }}
          onDisconnect={handleDisconnect}
          onCheckBirdSession={handleCheckBirdSession}
          onReconnectBird={handleReconnectBird}
        />
      </div>

      <ConnectionsDrawer
        drawerOpen={drawerOpen}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        selectedPlatformType={selectedPlatformType}
        selectedMethod={selectedMethod}
        formState={formState}
        error={error}
        isSaving={isSaving}
        onClose={closeDrawer}
        onProfileChange={setSelectedProfileId}
        onPlatformChange={resetFormForPlatform}
        onMethodChange={setSelectedMethodId}
        selectedMethodMode={selectedMethodMode}
        availableMethodModes={availableMethodModes}
        nativeAvailabilityByPlatform={nativeAvailabilityByPlatform}
        oauthCallbackUrlOverride={oauthCallbackUrlOverride}
        onMethodModeChange={(mode) => {
          setRequestedMethodMode(mode);
          setSelectedMethodId(null);
        }}
        onFieldChange={updateField}
        onSubmit={handleCreateConnection}
        onOAuthConnect={startOAuthConnection}
      />
    </div>
  );
}

function formatBirdSessionStatus(
  session:
    | {
        status?: string | null;
        checkedAt?: string | null;
        message?: string | null;
        error?: string | null;
      }
    | null
    | undefined
) {
  if (!session) {
    return {
      status: "unknown" as const,
      checkedAtLabel: null,
      message: null,
    };
  }

  const checkedAt = session.checkedAt ? new Date(session.checkedAt) : null;
  const checkedAtLabel =
    checkedAt && !Number.isNaN(checkedAt.getTime())
      ? checkedAt.toLocaleString()
      : null;
  const status: "ok" | "failed" | "unknown" =
    session.status === "ok" || session.status === "failed"
      ? session.status
      : "unknown";

  return {
    status,
    checkedAtLabel,
    message: session.error ?? session.message ?? null,
  };
}

function getConnectionAvatarUrl(config: Record<string, unknown> | null) {
  const source = config ?? {};
  return (
    readNestedString(source, ["avatarUrl"]) ||
    readNestedString(source, ["profilePicture"]) ||
    readNestedString(source, ["providerProfile", "avatarUrl"]) ||
    readNestedString(source, ["providerProfile", "profilePicture"]) ||
    readNestedString(source, ["lateAccount", "profilePicture"]) ||
    readNestedString(source, ["lateAccount", "metadata", "profilePicture"]) ||
    readNestedString(source, ["lateAccount", "metadata", "avatarUrl"]) ||
    readNestedString(source, [
      "lateAccount",
      "metadata",
      "profileData",
      "avatarUrl",
    ]) ||
    readNestedString(source, [
      "lateAccount",
      "metadata",
      "profileData",
      "profilePicture",
    ]) ||
    readNestedString(source, [
      "lateAccount",
      "metadata",
      "userProfile",
      "avatarUrl",
    ]) ||
    readNestedString(source, [
      "lateAccount",
      "metadata",
      "userProfile",
      "profilePicture",
    ]) ||
    null
  );
}

function readNestedString(
  source: Record<string, unknown>,
  path: string[]
): string | null {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function getOAuthStartUrl(
  platformType: PlatformType,
  params: URLSearchParams,
  oauthCallbackUrlOverride: string | null
) {
  const route = `/api/auth/${platformType.replace(/_/g, "-")}?${params.toString()}`;
  const callbackUrl = oauthCallbackUrlOverride;
  if (!callbackUrl || typeof window === "undefined") return route;

  const callbackOrigin = new URL(callbackUrl).origin;
  if (callbackOrigin === window.location.origin) return route;

  return new URL(route, callbackOrigin).toString();
}
