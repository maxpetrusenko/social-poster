type PlatformIdentityRow = {
  id: string;
  workspaceId: string | null;
  provider: string;
  type: string;
  accountId: string | null;
  enabled?: boolean;
  createdAt?: Date | number | string | null;
  updatedAt?: Date | number | string | null;
};

export function dedupePlatformRows<Row extends PlatformIdentityRow>(
  rows: readonly Row[]
): Row[] {
  const output: Row[] = [];
  const indexByIdentity = new Map<string, number>();

  for (const row of rows) {
    const identity = platformAccountIdentity(row);
    if (!identity) {
      output.push(row);
      continue;
    }

    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, output.length);
      output.push(row);
      continue;
    }

    if (comparePlatformRows(row, output[existingIndex]) > 0) {
      output[existingIndex] = row;
    }
  }

  return output;
}

export function pickPreferredPlatformRow<Row extends PlatformIdentityRow>(
  rows: readonly Row[]
): Row | null {
  let preferred: Row | null = null;
  for (const row of rows) {
    if (!preferred || comparePlatformRows(row, preferred) > 0) {
      preferred = row;
    }
  }
  return preferred;
}

function platformAccountIdentity(row: PlatformIdentityRow) {
  const accountId = row.accountId?.trim();
  if (!row.workspaceId || !accountId) return null;
  return [row.workspaceId, row.provider, row.type, accountId].join("\u001f");
}

function comparePlatformRows(left: PlatformIdentityRow, right: PlatformIdentityRow) {
  if (Boolean(left.enabled) !== Boolean(right.enabled)) {
    return left.enabled ? 1 : -1;
  }

  const updatedDelta = timeValue(left.updatedAt) - timeValue(right.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;

  const createdDelta = timeValue(left.createdAt) - timeValue(right.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return left.id.localeCompare(right.id);
}

function timeValue(value: Date | number | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
