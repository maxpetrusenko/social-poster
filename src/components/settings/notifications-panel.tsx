"use client";

import { useState } from "react";

type NotifPrefs = {
  postFailures: boolean;
  accountDisconnects: boolean;
  paymentAlerts: boolean;
  usageAlerts: boolean;
  marketingEmails: boolean;
};

const OPTIONS = [
  { key: "postFailures" as const, title: "Post Failures", desc: "Get notified when scheduled posts fail to publish" },
  { key: "accountDisconnects" as const, title: "Account Disconnects", desc: "Get notified when social accounts get disconnected" },
  { key: "paymentAlerts" as const, title: "Payment Alerts", desc: "Get notified when subscription payments fail" },
  { key: "usageAlerts" as const, title: "Usage Alerts", desc: "Receive warnings when approaching or reaching your plan limits" },
  { key: "marketingEmails" as const, title: "Marketing Emails", desc: "Occasional product updates, tips, and promotional emails" },
];

export function NotificationsPanel({ defaults }: { defaults: NotifPrefs }) {
  const [prefs, setPrefs] = useState(defaults);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: keyof NotifPrefs) {
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
        {OPTIONS.map((opt) => (
          <div key={opt.key} className="rounded-xl border border-[#e5d9c8] bg-white p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#171717]">{opt.title}</p>
              <p className="text-xs text-[#8d7c64] mt-0.5">{opt.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[opt.key]}
              disabled={saving === opt.key}
              onClick={() => toggle(opt.key)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-70 ${prefs[opt.key] ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${prefs[opt.key] ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#8d7c64] mt-6">
        Note: Critical account and security emails cannot be disabled.
      </p>
    </div>
  );
}
