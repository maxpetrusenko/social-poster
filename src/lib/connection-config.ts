export type StoredConnectionConfig = {
  profileId?: string | null;
  authMethod?: string | null;
  customInstructions?: string | null;
  credentials?: Record<string, unknown> | null;
  enableDirectFallbackForPublishing?: boolean;
  notes?: string | null;
  birdSession?: {
    status?: string | null;
    checkedAt?: string | null;
    source?: string | null;
    message?: string | null;
    error?: string | null;
  } | null;
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
    enableDirectFallbackForPublishing: readBooleanFlag(
      credentials?.enableDirectFallbackForPublishing ?? source.enableDirectFallbackForPublishing
    ),
    notes: typeof source.notes === "string" ? source.notes : null,
    birdSession: readBirdSession(source.birdSession),
    credentials,
  };
}

function readBooleanFlag(value: unknown) {
  return value === true;
}

function readBirdSession(value: unknown): StoredConnectionConfig["birdSession"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status : null,
    checkedAt: typeof record.checkedAt === "string" ? record.checkedAt : null,
    source: typeof record.source === "string" ? record.source : null,
    message: typeof record.message === "string" ? record.message : null,
    error: typeof record.error === "string" ? record.error : null,
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
