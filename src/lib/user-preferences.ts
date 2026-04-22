export const PRODUCT_MODES = ["saas", "agentic"] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];

export const AGENT_DOCK_MODES = ["left-side", "right-side", "right-widget"] as const;
export type AgentDockMode = (typeof AGENT_DOCK_MODES)[number];

export const DEFAULT_PRODUCT_MODE: ProductMode = "saas";
export const DEFAULT_AGENT_DOCK_MODE: AgentDockMode = "right-widget";
export const UI_PREFERENCES_STORAGE_KEY = "smmagent.uiPreferences.v2";

export function parseProductMode(value: unknown): ProductMode {
  return PRODUCT_MODES.includes(value as ProductMode)
    ? (value as ProductMode)
    : DEFAULT_PRODUCT_MODE;
}

export function parseAgentDockMode(value: unknown): AgentDockMode {
  return AGENT_DOCK_MODES.includes(value as AgentDockMode)
    ? (value as AgentDockMode)
    : DEFAULT_AGENT_DOCK_MODE;
}
