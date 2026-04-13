export type StoredConnectionConfig = {
  profileId?: string | null;
  authMethod?: string | null;
  customInstructions?: string | null;
  credentials?: Record<string, unknown> | null;
  notes?: string | null;
};

export function readStoredConnectionConfig(
  config: Record<string, unknown> | null | undefined
): StoredConnectionConfig {
  const source = config ?? {};
  const credentials =
    source.credentials &&
    typeof source.credentials === "object" &&
    !Array.isArray(source.credentials)
      ? (source.credentials as Record<string, unknown>)
      : null;

  return {
    profileId: typeof source.profileId === "string" ? source.profileId : null,
    authMethod: typeof source.authMethod === "string" ? source.authMethod : null,
    customInstructions:
      typeof source.customInstructions === "string"
        ? source.customInstructions
        : null,
    notes: typeof source.notes === "string" ? source.notes : null,
    credentials,
  };
}

export function summarizeCredentialState(
  config: Record<string, unknown> | null | undefined
) {
  const parsed = readStoredConnectionConfig(config);
  const credentials = parsed.credentials ?? {};
  const filledCount = Object.values(credentials).filter((value) => {
    if (typeof value === "boolean") return value;
    return typeof value === "string" && value.trim().length > 0;
  }).length;

  return {
    authMethod: parsed.authMethod,
    profileId: parsed.profileId,
    customInstructions: parsed.customInstructions,
    filledCredentialCount: filledCount,
  };
}
