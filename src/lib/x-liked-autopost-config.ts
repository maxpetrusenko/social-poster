export type XLikedAutopostEnv = Record<string, string | undefined>;

export function isXLikedAutopostWorkerEnabled(env: XLikedAutopostEnv = process.env) {
  return (
    env.X_LIKES_AUTOPUBLISH_ENABLED === "true" &&
    env.X_LIKES_AUTOPUBLISH_MODE === "publish"
  );
}

export function readXLikedAutopostIntervalMinutes(env: XLikedAutopostEnv = process.env) {
  const minutes = Number(env.X_LIKES_AUTOPUBLISH_INTERVAL_MINUTES ?? 2);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 2;
}

export function readXLikedAutopostLimit(env: XLikedAutopostEnv = process.env) {
  const limit = Number(env.X_LIKES_AUTOPUBLISH_LIMIT ?? 3);
  return Number.isFinite(limit) && limit > 0 ? Math.min(10, Math.floor(limit)) : 3;
}

export function readXLikedAutopostFetchCount(env: XLikedAutopostEnv = process.env) {
  const count = Number(env.X_LIKES_AUTOPUBLISH_FETCH_COUNT ?? 50);
  if (!Number.isFinite(count) || count <= 0) return 50;
  return 50;
}
