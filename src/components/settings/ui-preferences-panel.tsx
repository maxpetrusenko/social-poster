"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AGENT_DOCK_MODES,
  PRODUCT_MODES,
  UI_PREFERENCES_STORAGE_KEY,
  type AgentDockMode,
  type ProductMode,
} from "@/lib/user-preferences";
import { cn } from "@/lib/utils";

type UiPreferences = {
  productMode: ProductMode;
  agentDockMode: AgentDockMode;
};

const PRODUCT_MODE_COPY: Record<ProductMode, { title: string; description: string }> = {
  agentic: {
    title: "Agentic",
    description: "SMM Agent leads the flow. Review, approve, and steer.",
  },
  saas: {
    title: "SaaS",
    description: "Classic dashboard navigation with SMM Agent available as a widget.",
  },
};

const AGENT_DOCK_COPY: Record<AgentDockMode, { title: string; description: string }> = {
  "left-side": {
    title: "Left side",
    description: "Keep SMM Agent open beside the workspace.",
  },
  "right-side": {
    title: "Right side",
    description: "Dock SMM Agent as a persistent right panel.",
  },
  "right-widget": {
    title: "Right widget",
    description: "Use a compact floating SMM Agent button.",
  },
};

export function UiPreferencesPanel({ defaults }: { defaults: UiPreferences }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(defaults);
  const [saving, setSaving] = useState<keyof UiPreferences | null>(null);

  async function updatePreference(next: Partial<UiPreferences>) {
    const previous = prefs;
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setSaving(next.productMode ? "productMode" : "agentDockMode");
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("smmagent:ui-preferences", { detail: merged }));

    try {
      const response = await fetch("/api/settings/ui-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Failed to save UI preferences.");
      router.refresh();
    } catch {
      setPrefs(previous);
      window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(previous));
      window.dispatchEvent(new CustomEvent("smmagent:ui-preferences", { detail: previous }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-semibold text-[#171717]">App Mode</h2>
        <p className="mb-4 text-sm text-[#8d7c64]">
          Choose whether SMM Agent runs as an agent-first workspace or a classic SaaS dashboard.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {PRODUCT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updatePreference({ productMode: mode })}
              disabled={saving === "productMode"}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                prefs.productMode === mode
                  ? "border-[#171717] bg-[#171717] text-[#fff8ef]"
                  : "border-[#e5d9c8] bg-white text-[#171717] hover:border-[#af987b]"
              )}
            >
              <span className="text-sm font-semibold">{PRODUCT_MODE_COPY[mode].title}</span>
              <span
                className={cn(
                  "mt-1 block text-xs leading-5",
                  prefs.productMode === mode ? "text-[#f1dfc9]" : "text-[#8d7c64]"
                )}
              >
                {PRODUCT_MODE_COPY[mode].description}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-[#171717]">SMM Agent Placement</h2>
        <p className="mb-4 text-sm text-[#8d7c64]">
          Reposition the agent without leaving Settings.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {AGENT_DOCK_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updatePreference({ agentDockMode: mode })}
              disabled={saving === "agentDockMode"}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                prefs.agentDockMode === mode
                  ? "border-[#171717] bg-[#171717] text-[#fff8ef]"
                  : "border-[#e5d9c8] bg-white text-[#171717] hover:border-[#af987b]"
              )}
            >
              <span className="text-sm font-semibold">{AGENT_DOCK_COPY[mode].title}</span>
              <span
                className={cn(
                  "mt-1 block text-xs leading-5",
                  prefs.agentDockMode === mode ? "text-[#f1dfc9]" : "text-[#8d7c64]"
                )}
              >
                {AGENT_DOCK_COPY[mode].description}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
