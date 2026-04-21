"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type ApiKey = {
  id: string; name: string; keyPrefix: string; keySuffix: string;
  scope: string; permission: string; status: string;
  createdAt: Date | null; lastUsedAt: Date | null;
};

type Props = {
  activeTab: string;
  usage: {
    posts: number; maxPosts: number;
    profiles: number; maxProfiles: number;
    platforms: number; maxPlatforms: number;
    replies: number; comments: number; dms: number;
    uploads: number; apiCalls: number;
    plan: string; cycleResets: string;
  };
  user: { id: string; email: string; fullName: string; avatarUrl: string; authProvider: string };
  notifications: { postFailures: boolean; accountDisconnects: boolean; paymentAlerts: boolean; usageAlerts: boolean; marketingEmails: boolean };
  billing: { plan: string; planLabel: string; maxPosts: number; maxProfiles: number; maxPlatforms: number; billingEmail: string | null; cycleStart: string | null };
  apiKeys: ApiKey[];
  orgName: string;
};

const TABS = [
  { key: "usage", label: "Usage" },
  { key: "billing", label: "Billing" },
  { key: "api-keys", label: "API Keys" },
  { key: "profile", label: "Profile" },
  { key: "notifications", label: "Notifications" },
  { key: "danger", label: "Danger Zone" },
] as const;

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="h-2 w-full rounded-full bg-[#e5d9c8]">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${checked ? "bg-green-500" : "bg-gray-300"}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export function SettingsTabs({ activeTab, usage, user, notifications, billing, apiKeys, orgName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-[#171717] mb-1">Settings</h1>
      <p className="text-sm text-[#8d7c64] mb-6">Manage your workspace settings and preferences</p>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-[#e5d9c8] mb-8">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              t.key === "danger" ? "text-red-600" : "text-[#8d7c64]"
            } ${activeTab === t.key ? "!text-[#171717] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#171717]" : "hover:text-[#171717]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "usage" && <UsageTab usage={usage} />}
      {activeTab === "billing" && <BillingTab billing={billing} />}
      {activeTab === "api-keys" && <ApiKeysTab initialKeys={apiKeys} />}
      {activeTab === "profile" && <ProfileTab user={user} />}
      {activeTab === "notifications" && <NotificationsTab notifications={notifications} />}
      {activeTab === "danger" && <DangerTab orgName={orgName} />}
    </div>
  );
}

// ── Usage Tab ────────────────────────────────────────────────────────────────

function UsageTab({ usage }: { usage: Props["usage"] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Usage</h2>
      <p className="text-sm text-[#8d7c64] mb-6">
        Current billing cycle usage for your <strong>{usage.plan}</strong> plan
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard label="Posts Published" value={usage.posts} max={usage.maxPosts} resets={usage.cycleResets} />
        <MetricCard label="Profiles" value={usage.profiles} max={usage.maxProfiles} resets={usage.cycleResets} />
        <MetricCard label="Connected Accounts" value={usage.platforms} max={usage.maxPlatforms} resets={usage.cycleResets} />
        <MetricCard label="Replies Sent" value={usage.replies} resets={usage.cycleResets} />
        <MetricCard label="Comments Sent" value={usage.comments} resets={usage.cycleResets} />
        <MetricCard label="DMs Sent" value={usage.dms} resets={usage.cycleResets} />
        <MetricCard label="Uploads" value={usage.uploads} unlimitedLabel resets={usage.cycleResets} />
        <MetricCard label="API Calls" value={usage.apiCalls} resets={usage.cycleResets} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, max, unlimitedLabel, resets }: {
  label: string; value: number; max?: number; unlimitedLabel?: boolean; resets: string;
}) {
  return (
    <div className="bg-white border border-[#e5d9c8] rounded-xl p-4 shadow-sm">
      <p className="text-sm font-medium text-[#8d7c64] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#171717]">
        {value}
        {max != null && <span className="text-sm font-normal text-[#8d7c64]"> / {max}</span>}
        {unlimitedLabel && <span className="text-sm font-normal text-[#8d7c64]"> / Unlimited</span>}
      </p>
      {max != null && (
        <div className="mt-3">
          <ProgressBar value={value} max={max} />
        </div>
      )}
      <p className="text-xs text-[#8d7c64] mt-2">Resets {resets}</p>
    </div>
  );
}

// ── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ user }: { user: Props["user"] }) {
  const initials = user.fullName
    ? user.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  const providerLabel = user.authProvider === "google" ? "Google" : "Magic Link";

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Profile</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Your personal account details</p>

      <div className="bg-white border border-[#e5d9c8] rounded-xl p-6 shadow-sm max-w-md">
        <div className="flex items-center gap-4 mb-6">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-[#e5d9c8] flex items-center justify-center text-lg font-semibold text-[#8d7c64]">
              {initials}
            </div>
          )}
          <div>
            <p className="font-semibold text-[#171717]">{user.fullName || "No name set"}</p>
            <p className="text-sm text-[#8d7c64]">{user.email}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
            <span className="text-[#8d7c64]">Email</span>
            <span className="text-[#171717]">{user.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
            <span className="text-[#8d7c64]">Auth Provider</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e6] px-2.5 py-0.5 text-xs font-medium text-[#8d7c64]">
              {providerLabel}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#8d7c64]">User ID</span>
            <span className="text-[#171717] font-mono text-xs">{user.id.slice(0, 12)}...</span>
          </div>
        </div>

        <button
          disabled
          className="mt-6 w-full rounded-lg border border-[#e5d9c8] py-2 text-sm font-medium text-[#8d7c64] cursor-not-allowed opacity-60"
        >
          Edit profile (coming soon)
        </button>
      </div>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────────────

const NOTIF_OPTIONS = [
  { key: "postFailures" as const, title: "Post Failures", desc: "Get notified when scheduled posts fail to publish" },
  { key: "accountDisconnects" as const, title: "Account Disconnects", desc: "Get notified when social accounts get disconnected" },
  { key: "paymentAlerts" as const, title: "Payment Alerts", desc: "Get notified when subscription payments fail" },
  { key: "usageAlerts" as const, title: "Usage Alerts", desc: "Receive warnings when approaching or reaching your plan limits" },
  { key: "marketingEmails" as const, title: "Marketing Emails", desc: "Occasional product updates, tips, and promotional emails" },
] as const;

function NotificationsTab({ notifications }: { notifications: Props["notifications"] }) {
  const [prefs, setPrefs] = useState(notifications);
  const [saving, setSaving] = useState<string | null>(null);

  async function togglePref(key: keyof typeof prefs) {
    const newVal = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: newVal }));
    setSaving(key);
    try {
      await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newVal }),
      });
    } catch {
      setPrefs((p) => ({ ...p, [key]: !newVal }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Notifications</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Choose which emails you want to receive</p>

      <div className="space-y-3 max-w-lg">
        {NOTIF_OPTIONS.map((opt) => (
          <div key={opt.key} className="bg-white border border-[#e5d9c8] rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#171717]">{opt.title}</p>
              <p className="text-xs text-[#8d7c64] mt-0.5">{opt.desc}</p>
            </div>
            <Toggle
              checked={prefs[opt.key]}
              disabled={saving === opt.key}
              onChange={() => togglePref(opt.key)}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-[#8d7c64] mt-6">
        Note: Critical account and security emails cannot be disabled.
      </p>
    </div>
  );
}

// ── Billing Tab ─────────────────────────────────────────────────────────────

function BillingTab({ billing }: { billing: Props["billing"] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Billing</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Manage your subscription and billing details</p>

      <div className="max-w-lg space-y-4">
        <div className="bg-white border border-[#e5d9c8] rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8d7c64]">Current Plan</p>
              <p className="text-2xl font-bold text-[#171717] mt-1">{billing.planLabel}</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">ACTIVE</span>
          </div>
          <div className="space-y-2 text-sm border-t border-[#e5d9c8] pt-4">
            <div className="flex justify-between"><span className="text-[#8d7c64]">Posts / month</span><span className="text-[#171717] font-medium">{billing.maxPosts}</span></div>
            <div className="flex justify-between"><span className="text-[#8d7c64]">Profiles</span><span className="text-[#171717] font-medium">{billing.maxProfiles}</span></div>
            <div className="flex justify-between"><span className="text-[#8d7c64]">Connected accounts</span><span className="text-[#171717] font-medium">{billing.maxPlatforms}</span></div>
            {billing.billingEmail && (
              <div className="flex justify-between"><span className="text-[#8d7c64]">Billing email</span><span className="text-[#171717]">{billing.billingEmail}</span></div>
            )}
          </div>
        </div>

        <button disabled className="w-full rounded-xl border border-[#e5d9c8] bg-white py-3 text-sm font-medium text-[#8d7c64] cursor-not-allowed opacity-60">
          Upgrade plan (coming soon)
        </button>
      </div>
    </div>
  );
}

// ── API Keys Tab ────────────────────────────────────────────────────────────

function ApiKeysTab({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPermission, setNewPermission] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const filtered = keys.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()));

  async function createKey() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, permission: newPermission }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedKey(data.key);
        setKeys((prev) => [{ id: data.id, name: newName, keyPrefix: data.key.slice(0, 10), keySuffix: data.key.slice(-6), scope: "All profiles", permission: newPermission, status: "active", createdAt: new Date(), lastUsedAt: null }, ...prev]);
        setNewName("");
      }
    } finally { setCreating(false); }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" } : k));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-[#171717]">API Keys</h2>
        <button onClick={() => { setShowCreate(true); setCreatedKey(null); }} className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a2a2a]">
          + Create key
        </button>
      </div>
      <p className="text-sm text-[#8d7c64] mb-6">Authentication tokens for the programmatic API</p>

      {/* Create modal */}
      {showCreate && (
        <div className="mb-6 bg-white border border-[#e5d9c8] rounded-xl p-5 shadow-sm max-w-lg">
          {createdKey ? (
            <div>
              <p className="text-sm font-medium text-[#171717] mb-2">Key created</p>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3">
                <p className="text-xs text-amber-800 font-medium mb-1">Save this key — it won&apos;t be shown again</p>
                <code className="block text-xs text-[#171717] break-all font-mono">{createdKey}</code>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="rounded-lg bg-[#f5f0e6] px-3 py-1.5 text-xs font-medium text-[#171717]">
                  {copied ? "Copied!" : "Copy key"}
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-1.5 text-xs text-[#8d7c64]">Done</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8d7c64] mb-1">Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. mobile-app" className="w-full rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-[#8d7c64] mb-1">Permission</label>
                <select value={newPermission} onChange={(e) => setNewPermission(e.target.value)} className="w-full rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm focus:outline-none">
                  <option value="read">Read</option>
                  <option value="read_write">Read &amp; Write</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={createKey} disabled={creating || !newName.trim()} className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {creating ? "Creating..." : "Create"}
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2 text-sm text-[#8d7c64]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keys..." className="mb-4 w-full max-w-xs rounded-lg border border-[#e5d9c8] px-3 py-2 text-sm placeholder-[#8d7c64] focus:outline-none" />

      {/* Table */}
      <div className="bg-white border border-[#e5d9c8] rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#e5d9c8] text-left text-xs font-medium text-[#8d7c64]">
            <th className="px-4 py-3">Name</th><th className="px-4 py-3">Key</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Permission</th><th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#8d7c64]">No API keys yet</td></tr>
            ) : filtered.map((k) => (
              <tr key={k.id} className="border-b border-[#e5d9c8] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-[#171717]">{k.name}</p>
                  {k.createdAt && <p className="text-[10px] text-[#8d7c64]">{new Date(k.createdAt).toLocaleDateString()}</p>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#8d7c64]">{k.keyPrefix}...{k.keySuffix}</td>
                <td className="px-4 py-3 text-xs">All profiles</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${k.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{k.status}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-[#e5d9c8] px-2 py-0.5 text-[10px] font-medium text-[#8d7c64]">{k.permission === "read_write" ? "Read & Write" : "Read"}</span>
                </td>
                <td className="px-4 py-3">{k.status === "active" && (
                  <button onClick={() => revokeKey(k.id)} className="text-xs text-red-600 hover:text-red-800">Revoke</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Danger Zone Tab ──────────────────────────────────────────────────────────

function DangerTab({ orgName }: { orgName: string }) {
  const [wsConfirm, setWsConfirm] = useState("");
  const [orgConfirm, setOrgConfirm] = useState("");

  return (
    <div>
      <h2 className="text-lg font-semibold text-red-600 mb-1">Danger Zone</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Irreversible actions that affect your account</p>

      <div className="space-y-6 max-w-lg">
        {/* Delete workspace */}
        <div className="border border-red-200 rounded-xl p-5 bg-red-50/30">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Delete Workspace</h3>
          <p className="text-xs text-[#8d7c64] mb-3">
            This will permanently delete the workspace, all posts, schedules, and connected accounts.
          </p>
          <input
            type="text"
            placeholder="Type workspace name to confirm"
            value={wsConfirm}
            onChange={(e) => setWsConfirm(e.target.value)}
            className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-3"
          />
          <button
            disabled
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
          >
            Delete Workspace
          </button>
        </div>

        {/* Delete organization */}
        <div className="border border-red-200 rounded-xl p-5 bg-red-50/30">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Delete Organization</h3>
          <p className="text-xs text-[#8d7c64] mb-3">
            This will permanently delete the organization ({orgName}), all workspaces, members, and data. This cannot be undone.
          </p>
          <input
            type="text"
            placeholder={`Type "${orgName}" to confirm`}
            value={orgConfirm}
            onChange={(e) => setOrgConfirm(e.target.value)}
            className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-3"
          />
          <button
            disabled
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
          >
            Delete Organization
          </button>
        </div>
      </div>
    </div>
  );
}
