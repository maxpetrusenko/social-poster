"use client";

import Link from "next/link";
import { PauseCircle, PlayCircle, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformType } from "@/lib/platforms";

type ConnectionStatus = "all" | "enabled" | "disabled";

export type ConnectionCardItem = {
  id: string;
  accountLabel: string;
  secondaryLabel: string | null;
  platformLabel: string;
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
          <div
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.9rem] border text-sm font-semibold"
            style={{
              color: item.accent,
              backgroundColor: `${item.accent}12`,
              borderColor: `${item.accent}25`,
            }}
          >
            {item.shortLabel}
          </div>
          <div className="min-w-0">
            <p className="text-[1.02rem] font-semibold leading-none text-[#171717]">
              {item.platformLabel}
            </p>
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
