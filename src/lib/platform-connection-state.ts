export const DISCONNECTED_CONNECTION_FLAG = "disconnectedAt";

export function isPlatformConnectionDisconnected(
  config: Record<string, unknown> | null | undefined
) {
  const value = config?.[DISCONNECTED_CONNECTION_FLAG];
  return typeof value === "string" && value.trim().length > 0;
}
