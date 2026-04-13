import type { PostCategoryValue } from "./post-categories";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeAdvancedScheduleConfig(
  config: Record<string, unknown> | null | undefined
) {
  if (!config || !isObject(config)) return "";

  const advanced = { ...config };
  delete advanced.contentCategory;
  return Object.keys(advanced).length > 0
    ? JSON.stringify(advanced, null, 2)
    : "";
}

export function buildScheduleConfig(input: {
  contentCategory: PostCategoryValue | string;
  advancedConfigText: string;
  baseConfig?: Record<string, unknown> | null;
}) {
  const trimmedJson = input.advancedConfigText.trim();
  let advancedConfig: Record<string, unknown> = {};

  if (trimmedJson) {
    const parsed = JSON.parse(trimmedJson);
    if (!isObject(parsed)) {
      throw new Error("Advanced config must be a JSON object");
    }
    advancedConfig = parsed;
  }

  return {
    ...(input.baseConfig ?? {}),
    ...advancedConfig,
    contentCategory: input.contentCategory,
  };
}
