// Barrel export for shared platform utilities
export * from "./types";
export { BasePlatform, LegacyProviderAdapter } from "./base-platform";
export type { ProviderCredentials } from "./base-platform";
export {
  buildAuthUrl,
  normalizeTokens,
  generateCodeVerifier,
  generateCodeChallenge,
  refreshOAuthToken,
} from "./oauth-utils";
export {
  readBytes,
  toArrayBuffer,
  uploadBinary,
  buildMultipartBody,
  firstMediaSource,
} from "./media-upload";
export type { MultipartPart } from "./media-upload";
export { RateLimiter } from "./rate-limiter";
export type { RateLimitRule } from "./rate-limiter";
export * from "./connection-config";
