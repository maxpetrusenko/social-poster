/**
 * Abstract base class for the new PlatformModule architecture.
 *
 * Provides the same HTTP helpers as SocialProvider (requestJson, request,
 * credential) plus default no-op stubs for optional capabilities.
 */

import {
  SocialProvider,
  REQUEST_TIMEOUT_MS,
  type ProviderCredentials,
} from "../../lib/providers/base";
import { APIError, RateLimitError } from "../../lib/providers/errors";
import type {
  PlatformModule,
  PlatformCapability,
  PlatformAuth,
  PlatformPosting,
  PlatformAnalytics,
  PlatformInbox,
  PlatformComments,
  PlatformEngagement,
  PlatformWebhooks,
  RateLimitConfig,
} from "./types";

export { REQUEST_TIMEOUT_MS };
export type { ProviderCredentials };

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

export abstract class BasePlatform implements PlatformModule {
  protected credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials = {}) {
    this.credentials = credentials;
  }

  // --- identity (must be implemented by subclass) ---
  abstract id: string;
  abstract name: string;
  abstract capabilities: PlatformCapability[];
  abstract auth: PlatformAuth;

  get rateLimits(): RateLimitConfig {
    return { requestsPerHour: 200, requestsPerDay: 5000, publishPerDay: 25 };
  }

  // --- optional capability slots (override in subclass) ---
  posting?: PlatformPosting;
  analytics?: PlatformAnalytics;
  inbox?: PlatformInbox;
  comments?: PlatformComments;
  engagement?: PlatformEngagement;
  webhooks?: PlatformWebhooks;

  // --- capability check ---
  hasCapability(cap: PlatformCapability): boolean {
    return this.capabilities.includes(cap);
  }

  // --- credential helpers (same pattern as SocialProvider) ---
  protected credential(...keys: string[]): string {
    for (const key of keys) {
      const value = this.credentials[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    throw new Error(`${this.name} missing credential: ${keys.join(" or ")}`);
  }

  // --- HTTP helpers (duplicated from SocialProvider so subclasses don't need
  //     to extend both hierarchies — keeps inheritance flat) ---

  protected async requestJson<T>(
    method: string,
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const response = await this.request(method, url, options);
    return (await safeJson(response)) as T;
  }

  protected async request(
    method: string,
    url: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const requestUrl = new URL(url);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined && value !== null) {
        requestUrl.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    let body = options.body;
    if (options.json !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(options.json);
    } else if (options.form) {
      headers["Content-Type"] =
        headers["Content-Type"] ?? "application/x-www-form-urlencoded";
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(options.form)) {
        if (value !== undefined && value !== null) {
          form.set(key, String(value));
        }
      }
      body = form;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const text = await response.text();
      throw new RateLimitError(
        `Rate limit exceeded for ${this.name}: ${text.slice(0, 500)}`,
        {
          platform: this.name,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
          rawResponse: parseJsonObject(text),
        }
      );
    }

    if (response.status >= 400) {
      const text = await response.text();
      throw new APIError(
        `${this.name} API error ${response.status}: ${text.slice(0, 500)}`,
        {
          platform: this.name,
          statusCode: response.status,
          rawResponse: parseJsonObject(text),
        }
      );
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Adapter: wrap a legacy SocialProvider as a PlatformModule
// ---------------------------------------------------------------------------

export class LegacyProviderAdapter implements PlatformModule {
  readonly id: string;
  readonly name: string;
  readonly capabilities: PlatformCapability[] = ["posting"];
  readonly rateLimits: RateLimitConfig;
  readonly auth: PlatformAuth;
  readonly posting: PlatformPosting;

  constructor(platformId: string, provider: SocialProvider) {
    this.id = platformId;
    this.name = provider.platformName;
    this.rateLimits = provider.rateLimits;

    this.auth = {
      authType: provider.authType,
      requiredScopes: provider.requiredScopes,
      getAuthUrl: (r, s, v) => provider.getAuthUrl(r, s, v),
      exchangeCode: (c, r, v) => provider.exchangeCode(c, r, v),
      refreshToken: (t) => provider.refreshToken(t),
      getProfile: (t) => provider.getProfile(t),
    };

    this.posting = {
      supportedPostTypes: provider.supportedPostTypes,
      supportedMediaTypes: provider.supportedMediaTypes,
      maxCaptionLength: provider.maxCaptionLength,
      createPost: (t, c) => provider.publishPost(t, c),
    };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface RequestOptions {
  accessToken?: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: Record<string, string | number | boolean | undefined | null>;
  body?: BodyInit;
  timeoutMs?: number;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
