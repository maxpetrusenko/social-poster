"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PauseCircle, PlayCircle, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformType } from "@/lib/platforms";

type ConnectionStatus = "all" | "enabled" | "disabled";

export type ConnectionCardItem = {
  id: string;
  platformType: PlatformType;
  accountLabel: string;
  secondaryLabel: string | null;
  platformLabel: string;
  handle: string | null;
  accent: string;
  glow: string;
  shortLabel: string;
  providerLabel: string;
  profileLabel: string;
  enabled: boolean;
  authLabel: string;
  credentialCount: number;
  scheduleCount: number;
  deliveryCount30d: number;
  failureCount30d: number;
  customInstructions: string | null;
  createdAtLabel: string | null;
  manageLabel: string;
};

export function ConnectionsWorkspaceHeader({
  workspaceName,
  organizationName,
  connectedCount,
  enabledCount,
  deliveryCount30d,
  profileCount,
  selectedProfileId,
  selectedPlatformType,
  selectedStatus,
  profiles,
  onProfileChange,
  onPlatformChange,
  onStatusChange,
  onCreateConnection,
}: {
  workspaceName: string;
  organizationName: string;
  connectedCount: number;
  enabledCount: number;
  deliveryCount30d: number;
  profileCount: number;
  selectedProfileId: string;
  selectedPlatformType: PlatformType | "all";
  selectedStatus: ConnectionStatus;
  profiles: Array<{ id: string; name: string }>;
  onProfileChange: (value: string) => void;
  onPlatformChange: (value: PlatformType | "all") => void;
  onStatusChange: (value: ConnectionStatus) => void;
  onCreateConnection: () => void;
}) {
  return (
    <section className="rounded-[1.9rem] border border-[#ddd2bf] bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_14px_36px_rgba(23,23,23,0.05)] md:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e7556]">
            {organizationName}
          </p>
          <h1 className="text-[2.3rem] font-semibold tracking-[-0.06em] text-[#171717]">
            {workspaceName} Connections
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#786a55]">
            {connectedCount} connected, {enabledCount} enabled, {deliveryCount30d} deliveries in the last 30 days, {profileCount} profiles available.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:min-w-[360px] xl:max-w-[420px]">
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={selectedProfileId}
              onChange={(event) => onProfileChange(event.target.value)}
              className="rounded-[14px] border border-[#ddd2bf] bg-white px-3 py-3 text-sm text-[#171717] outline-none"
            >
              <option value="all">All profiles</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <select
              value={selectedPlatformType}
              onChange={(event) =>
                onPlatformChange(event.target.value as PlatformType | "all")
              }
              className="rounded-[14px] border border-[#ddd2bf] bg-white px-3 py-3 text-sm text-[#171717] outline-none"
            >
              <option value="all">All platforms</option>
              <option value="twitter">X</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="reddit">Reddit</option>
            </select>
            <select
              value={selectedStatus}
              onChange={(event) =>
                onStatusChange(event.target.value as ConnectionStatus)
              }
              className="rounded-[14px] border border-[#ddd2bf] bg-white px-3 py-3 text-sm text-[#171717] outline-none"
            >
              <option value="all">All status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onCreateConnection}
            className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white"
          >
            Add connection
          </button>
        </div>
      </div>
    </section>
  );
}

export function ConnectionsGrid({
  items,
  togglingId,
  disconnectingId,
  onToggle,
  onDisconnect,
}: {
  items: ConnectionCardItem[];
  togglingId: string | null;
  disconnectingId: string | null;
  onToggle: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-[2rem] border border-dashed border-[#d5c7b0] bg-[rgba(252,248,241,0.7)] px-6 py-12 text-center shadow-[0_18px_44px_rgba(23,23,23,0.04)]">
        <p className="font-serif text-[2rem] tracking-[-0.05em] text-[#171717]">
          No connections in this slice
        </p>
        <p className="mt-3 text-sm leading-7 text-[#786a55]">
          Try a wider filter or add another account to this workspace.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <ConnectionCard
          key={item.id}
          item={item}
          toggling={togglingId === item.id}
          disconnecting={disconnectingId === item.id}
          onToggle={onToggle}
          onDisconnect={onDisconnect}
        />
      ))}
    </section>
  );
}

function ConnectionCard({
  item,
  toggling,
  disconnecting,
  onToggle,
  onDisconnect,
}: {
  item: ConnectionCardItem;
  toggling: boolean;
  disconnecting: boolean;
  onToggle: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-[1.1rem] border border-[#e2d8c8] bg-white p-4 shadow-[0_8px_24px_rgba(23,23,23,0.05)] transition hover:border-[#d0bea5]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ConnectionAvatar item={item} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBrandIcon type={item.platformType} className="h-5 w-5" />
              <p className="text-[1.02rem] font-semibold leading-none text-[#171717]">
                {item.platformLabel}
              </p>
            </div>
            <p className="mt-3 text-[1.05rem] font-semibold leading-tight text-[#171717]">
              {item.accountLabel}
            </p>
            <p className="mt-2 text-sm text-[#7b6b56]">
              {item.secondaryLabel || item.providerLabel}
            </p>
          </div>
        </div>

        <StatusPill connected={item.enabled} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <InlineChip>{item.profileLabel}</InlineChip>
      </div>

      {item.customInstructions ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6d5f4c]">
          {item.customInstructions}
        </p>
      ) : null}

      {!item.enabled ? (
        <div className="mt-3 rounded-[0.9rem] border border-[#ead7a7] bg-[#fff5da] px-3 py-2 text-sm leading-6 text-[#89661b]">
          Attached content stays intact. Publishing skips this account until it
          is enabled again.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/platforms/${item.id}`}
          className="inline-flex items-center justify-center rounded-[0.8rem] border border-[#ddd2bf] bg-[#fbf8f2] px-3 py-2 text-sm font-semibold text-[#6c5d48] transition hover:border-[#c9b899]"
        >
          {item.manageLabel}
        </Link>
        <button
          type="button"
          onClick={() => onDisconnect(item.id)}
          disabled={disconnecting}
          className="inline-flex items-center justify-center gap-2 rounded-[0.8rem] border border-[#ddd2bf] bg-white px-3 py-2 text-sm font-semibold text-[#6c5d48] transition hover:border-[#c9b899] disabled:opacity-60"
        >
          <Unplug className="h-4 w-4" />
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onToggle(item.id)}
        disabled={toggling}
        className={cn(
          "mt-3 inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-60",
          item.enabled ? "text-[#8c6a22]" : "text-[#2f7b4f]"
        )}
      >
        {item.enabled ? (
          <PauseCircle className="h-4 w-4" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        {toggling
          ? item.enabled
            ? "Pausing..."
            : "Enabling..."
          : item.enabled
            ? "Pause posting"
            : "Enable posting"}
      </button>
    </article>
  );
}

function InlineChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[0.55rem] bg-[#f5f3ef] px-2.5 py-1 text-[11px] font-medium text-[#756756]">
      {children}
    </span>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "rounded-[0.55rem] px-2.5 py-1 text-xs font-semibold",
        connected
          ? "bg-[#dff8e6] text-[#2f7b4f]"
          : "bg-[#eef0f4] text-[#707786]"
      )}
    >
      {connected ? "connected" : "disabled"}
    </span>
  );
}

function ConnectionAvatar({ item }: { item: ConnectionCardItem }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = getAccountAvatarUrl(item.platformType, item.handle);

  return (
    <div className="relative h-12 w-12 shrink-0">
      <div
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[0.9rem] border bg-[#f8f4ee]"
        style={{ borderColor: `${item.accent}25` }}
      >
        {avatarUrl && !failed ? (
          <Image
            src={avatarUrl}
            alt={`${item.accountLabel} avatar`}
            className="h-full w-full object-cover"
            width={48}
            height={48}
            unoptimized
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            className="text-sm font-semibold"
            style={{ color: item.accent }}
          >
            {getInitials(item.accountLabel, item.shortLabel)}
          </span>
        )}
      </div>

      <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-[0_2px_8px_rgba(23,23,23,0.12)]">
        <PlatformBrandIcon type={item.platformType} className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}

function getAccountAvatarUrl(type: PlatformType, handle: string | null) {
  const cleanHandle = (handle || "").trim().replace(/^@/, "");
  if (!cleanHandle) return null;

  const provider = {
    twitter: "x",
    linkedin: "linkedin",
    instagram: "instagram",
    tiktok: "tiktok",
    facebook: "facebook",
    reddit: "reddit",
    pinterest: "pinterest",
    youtube: "youtube",
  }[type];

  return `https://unavatar.io/${provider}/${encodeURIComponent(cleanHandle)}`;
}

function getInitials(label: string, fallback: string) {
  const parts = label
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function PlatformBrandIcon({
  type,
  className,
}: {
  type: PlatformType;
  className?: string;
}) {
  const commonProps = {
    className,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
  };

  switch (type) {
    case "twitter":
      return (
        <svg {...commonProps}>
          <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.639 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.241H4.298z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...commonProps}>
          <path d="M20.447 20.452h-3.554V14.87c0-1.332-.027-3.045-1.854-3.045-1.854 0-2.137 1.445-2.137 2.947v5.68H9.35V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124M7.119 20.452H3.555V9h3.564z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...commonProps}>
          <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2m0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95zm8.95 1.35a1.2 1.2 0 1 1-1.2 1.2 1.2 1.2 0 0 1 1.2-1.2M12 6.86A5.14 5.14 0 1 1 6.86 12 5.14 5.14 0 0 1 12 6.86m0 1.8A3.34 3.34 0 1 0 15.34 12 3.34 3.34 0 0 0 12 8.66" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...commonProps}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.35h-3.13v12.98a2.67 2.67 0 1 1-1.83-2.54V9.59a5.82 5.82 0 1 0 5.96 5.81V8.91a7.93 7.93 0 0 0 4.77 1.6z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...commonProps}>
          <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5H17V4.9c-.3 0-1.2-.1-2.4-.1-2.4 0-4 1.5-4 4.2V11H8v3h2.2v8z" />
        </svg>
      );
    case "reddit":
      return (
        <svg {...commonProps}>
          <path d="M14.47 15.08a1 1 0 0 1-1.41 1.41 1.98 1.98 0 0 1-2.83 0 1 1 0 1 1-1.41-1.41 3.98 3.98 0 0 0 5.65 0M9 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2m6-2a1 1 0 1 0 .001-2.001A1 1 0 0 0 15 11m7-1a2 2 0 0 1-3.29 1.52c.05.32.08.65.08.98 0 3.31-3.13 6-7 6s-7-2.69-7-6c0-.34.03-.67.08-.99A2 2 0 1 1 6.7 8.6a12.1 12.1 0 0 1 4.85-1.31L12.7 3.9a1 1 0 0 1 .97-.72l3.6.3a2 2 0 1 1-.16 1.4l-2.93-.24-.93 2.72A12.13 12.13 0 0 1 17.3 8.6 2 2 0 0 1 22 10" />
        </svg>
      );
    case "pinterest":
      return (
        <svg {...commonProps}>
          <path d="M12 2a10 10 0 0 0-3.64 19.32c-.05-1.47 0-3.24.39-4.83l1.53-6.47s-.38-.76-.38-1.88c0-1.76 1.02-3.07 2.29-3.07 1.08 0 1.6.81 1.6 1.78 0 1.08-.69 2.7-1.05 4.2-.3 1.26.64 2.29 1.88 2.29 2.25 0 3.98-2.37 3.98-5.79 0-3.03-2.18-5.15-5.29-5.15-3.6 0-5.72 2.7-5.72 5.5 0 1.09.42 2.26.95 2.89a.38.38 0 0 1 .09.36l-.36 1.49c-.06.24-.2.3-.46.18-1.71-.79-2.78-3.27-2.78-5.26 0-4.28 3.11-8.21 8.96-8.21 4.7 0 8.35 3.35 8.35 7.83 0 4.67-2.94 8.43-7.02 8.43-1.37 0-2.66-.71-3.1-1.56l-.84 3.2c-.3 1.17-1.13 2.64-1.68 3.54A10 10 0 1 0 12 2" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...commonProps}>
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.53 3.5 12 3.5 12 3.5s-7.53 0-9.4.58A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12c1.87.58 9.4.58 9.4.58s7.53 0 9.4-.58a3 3 0 0 0 2.1-2.12A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8M9.75 15.62V8.38L16.02 12z" />
        </svg>
      );
  }
}
