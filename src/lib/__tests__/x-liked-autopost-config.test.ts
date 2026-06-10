import { describe, expect, it } from "vitest";

import {
  isXLikedAutopostWorkerEnabled,
  readXLikedAutopostFetchCount,
  readXLikedAutopostIntervalMinutes,
  readXLikedAutopostLimit,
} from "../x-liked-autopost-config";

describe("X liked autopost config", () => {
  it("requires explicit publish mode for the background worker", () => {
    expect(
      isXLikedAutopostWorkerEnabled({
        X_LIKES_AUTOPUBLISH_ENABLED: "true",
      })
    ).toBe(false);

    expect(
      isXLikedAutopostWorkerEnabled({
        X_LIKES_AUTOPUBLISH_ENABLED: "true",
        X_LIKES_AUTOPUBLISH_MODE: "publish",
      })
    ).toBe(true);
  });

  it("clamps interval, limit, and fetch count", () => {
    const env = {
      X_LIKES_AUTOPUBLISH_INTERVAL_MINUTES: "0",
      X_LIKES_AUTOPUBLISH_LIMIT: "42",
      X_LIKES_AUTOPUBLISH_FETCH_COUNT: "10",
    };

    expect(readXLikedAutopostIntervalMinutes(env)).toBe(60);
    expect(readXLikedAutopostLimit(env)).toBe(10);
    expect(readXLikedAutopostFetchCount(env)).toBe(10);
  });

  it("defaults to one hourly import run", () => {
    expect(readXLikedAutopostIntervalMinutes({})).toBe(60);
    expect(readXLikedAutopostLimit({})).toBe(1);
    expect(readXLikedAutopostFetchCount({})).toBe(50);
  });
});
