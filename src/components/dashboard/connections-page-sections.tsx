"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformType } from "@/lib/platforms";
import type { PlatformRow } from "./connections-types";
import { PlatformBrandIcon } from "./platform-brand-icon";

type ConnectionStatus = "all" | "enabled" | "disabled";
export type ConnectionViewMode = "native" | "proxy";

export type ConnectionCardItem = {
  id: string;
  platformType: PlatformType;
  accountLabel: string;
  secondaryLabel: string | null;
  avatarUrl: string | null;
  platformLabel: string;
  handle: string | null;
  provider: PlatformRow["provider"];
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
  birdSession:
    | {
        status: "ok" | "failed" | "unknown";
        checkedAtLabel: string | null;
        message: string | null;
      }
    | null;
};

export function ConnectionsWorkspaceHeader({
  workspaceName,
  selectedProfileId,
  selectedPlatformType,
  selectedStatus,
  selectedViewMode,
  profiles,
  onProfileChange,
  onPlatformChange,
  onStatusChange,
  onViewModeChange,
  onCreateConnection,
}: {
  workspaceName: string;
  selectedProfileId: string;
  selectedPlatformType: PlatformType | "all";
  selectedStatus: ConnectionStatus;
  selectedViewMode: ConnectionViewMode;
  profiles: Array<{ id: string; name: string }>;
  onProfileChange: (value: string) => void;
  onPlatformChange: (value: PlatformType | "all") => void;
  onStatusChange: (value: ConnectionStatus) => void;
  onViewModeChange: (value: ConnectionViewMode) => void;
  onCreateConnection: () => void;
}) {
  return (
    <section className="rounded-[1.9rem] border border-[#ddd2bf] bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_14px_36px_rgba(23,23,23,0.05)] md:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-[2.3rem] font-semibold tracking-[-0.06em] text-[#171717]">
            {workspaceName} Connections
          </h1>
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
              <option value="linkedin_personal">LinkedIn Personal</option>
              <option value="linkedin_company">LinkedIn Company</option>
              <option value="instagram">Instagram</option>
              <option value="instagram_personal">Instagram Personal</option>
              <option value="facebook">Facebook</option>
              <option value="threads">Threads</option>
              <option value="bluesky">Bluesky</option>
              <option value="google_business">Google Business</option>
              <option value="mastodon">Mastodon</option>
              <option value="whatsapp">WhatsApp</option>
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

      <div className="mt-5 grid gap-3 rounded-[1.1rem] border border-[#e1d5c2] bg-[#f7f1e6] p-1 md:grid-cols-2">
        {[
          {
            id: "native" as const,
            label: "Native auth connections",
            summary: "Connected through platform apps and OAuth tokens.",
          },
          {
            id: "proxy" as const,
            label: "Proxy connections",
            summary: "Connected through Late/GetLate or Bird.",
          },
        ].map((tab) => {
          const active = tab.id === selectedViewMode;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewModeChange(tab.id)}
              className={`rounded-[0.9rem] px-4 py-3 text-left transition ${
                active
                  ? "bg-white shadow-[0_6px_18px_rgba(23,23,23,0.07)]"
                  : "hover:bg-[rgba(255,255,255,0.45)]"
              }`}
            >
              <span className="block text-sm font-semibold text-[#171717]">
                {tab.label}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#786a55]">
                {tab.summary}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ConnectionsGrid({
  items,
  togglingId,
  disconnectingId,
  checkingBirdId,
  onToggle,
  onDisconnect,
  onCheckBirdSession,
}: {
  items: ConnectionCardItem[];
  togglingId: string | null;
  disconnectingId: string | null;
  checkingBirdId: string | null;
  onToggle: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
  onCheckBirdSession: (platformId: string) => void;
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
          checkingBird={checkingBirdId === item.id}
          onToggle={onToggle}
          onDisconnect={onDisconnect}
          onCheckBirdSession={onCheckBirdSession}
        />
      ))}
    </section>
  );
}

function ConnectionCard({
  item,
  toggling,
  disconnecting,
  checkingBird,
  onToggle,
  onDisconnect,
  onCheckBirdSession,
}: {
  item: ConnectionCardItem;
  toggling: boolean;
  disconnecting: boolean;
  checkingBird: boolean;
  onToggle: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
  onCheckBirdSession: (platformId: string) => void;
}) {
  const canCheckBirdSession =
    item.provider === "bird" && item.platformType === "twitter";

  return (
    <article className="flex h-full flex-col rounded-[1.1rem] border border-[#e2d8c8] bg-white p-4 shadow-[0_8px_24px_rgba(23,23,23,0.05)] transition hover:border-[#d0bea5]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ConnectionAvatar item={item} />
          <div className="min-w-0">
            <p className="text-[1.05rem] font-semibold leading-tight text-[#171717]">
              {item.accountLabel}
            </p>
            <p className="mt-2 text-sm text-[#7b6b56]">
              {item.secondaryLabel || item.providerLabel}
            </p>
          </div>
        </div>

        <StatusPill connected={item.enabled} />
      </div>

      {item.customInstructions ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6d5f4c]">
          {item.customInstructions}
        </p>
      ) : null}

      {canCheckBirdSession ? (
        <BirdSessionPanel item={item} checking={checkingBird} onCheck={onCheckBirdSession} />
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

function BirdSessionPanel({
  item,
  checking,
  onCheck,
}: {
  item: ConnectionCardItem;
  checking: boolean;
  onCheck: (platformId: string) => void;
}) {
  const session = item.birdSession;
  const ok = session?.status === "ok";
  const failed = session?.status === "failed";

  return (
    <div
      className={cn(
        "mt-3 rounded-[0.9rem] border px-3 py-2 text-sm leading-6",
        ok
          ? "border-[#c9e1c7] bg-[#f1faee] text-[#2f6d43]"
          : failed
            ? "border-[#efd0bd] bg-[#fff1e8] text-[#99512c]"
            : "border-[#ded4c4] bg-[#fbf7f0] text-[#6d5f4c]"
      )}
    >
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : failed ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {ok ? "Bird session healthy" : failed ? "Bird session needs reconnect" : "Bird session not checked"}
          </p>
          <p className="mt-1 text-xs leading-5">
            {session?.message ??
              "Check reads one recent mention through Bird without posting."}
          </p>
          {session?.checkedAtLabel ? (
            <p className="mt-1 text-xs opacity-75">
              Checked {session.checkedAtLabel}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCheck(item.id)}
        disabled={checking}
        className="mt-2 inline-flex items-center gap-2 rounded-[0.75rem] border border-current/20 bg-white/70 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", checking ? "animate-spin" : "")} />
        {checking ? "Checking..." : "Check Bird session"}
      </button>
    </div>
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
  const avatarUrl =
    item.avatarUrl || getAccountAvatarUrl(item.platformType, item.handle);

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
          <span style={{ color: item.accent }}>
            <PlatformBrandIcon type={item.platformType} className="h-6 w-6" />
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
    linkedin_personal: "linkedin",
    linkedin_company: "linkedin",
    instagram: "instagram",
    instagram_personal: "instagram",
    tiktok: "tiktok",
    facebook: "facebook",
    threads: "threads",
    bluesky: "bluesky",
    google_business: "google",
    mastodon: "mastodon",
    whatsapp: "whatsapp",
    reddit: "reddit",
    pinterest: "pinterest",
    youtube: "youtube",
  }[type];

  return `https://unavatar.io/${provider}/${encodeURIComponent(cleanHandle)}`;
}
