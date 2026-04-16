import { APIError, RateLimitError } from "./errors";
import type {
  AccountProfile,
  AuthType,
  MediaType,
  OAuthTokens,
  PostType,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

export const REQUEST_TIMEOUT_MS = 30_000;

export type ProviderCredentials = Record<string, string | undefined>;

export abstract class SocialProvider {
  protected credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials = {}) {
    this.credentials = credentials;
  }

  abstract platformName: string;
  abstract authType: AuthType;
  abstract maxCaptionLength: number;
  abstract supportedPostTypes: PostType[];
  abstract supportedMediaTypes: MediaType[];
  abstract requiredScopes: string[];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 5000,
      publishPerDay: 25,
    };
  }

  getAuthUrl(_redirectUri: string, _state: string): string {
    void _redirectUri;
    void _state;
    throw new Error(`${this.platformName} does not implement getAuthUrl`);
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<OAuthTokens> {
    void _code;
    void _redirectUri;
    throw new Error(`${this.platformName} does not implement exchangeCode`);
  }

  async refreshToken(_refreshToken: string): Promise<OAuthTokens> {
    void _refreshToken;
    throw new Error(`${this.platformName} does not implement refreshToken`);
  }

  abstract getProfile(accessToken: string): Promise<AccountProfile>;

  abstract publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult>;

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.getProfile(accessToken);
      return true;
    } catch {
      return false;
    }
  }

  protected credential(...keys: string[]): string {
    for (const key of keys) {
      const value = this.credentials[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    throw new Error(`${this.platformName} missing credential: ${keys.join(" or ")}`);
  }

  protected async requestJson<T>(
    method: string,
    url: string,
    options: {
      accessToken?: string;
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean | undefined | null>;
      json?: unknown;
      form?: Record<string, string | number | boolean | undefined | null>;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const response = await this.request(method, url, options);
    return (await safeJson(response)) as T;
  }

  protected async request(
    method: string,
    url: string,
    options: {
      accessToken?: string;
      headers?: Record<string, string>;
      params?: Record<string, string | number | boolean | undefined | null>;
      json?: unknown;
      form?: Record<string, string | number | boolean | undefined | null>;
      body?: BodyInit;
      timeoutMs?: number;
    } = {}
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
        `Rate limit exceeded for ${this.platformName}: ${text.slice(0, 500)}`,
        {
          platform: this.platformName,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
          rawResponse: parseJsonObject(text),
        }
      );
    }

    if (response.status >= 400) {
      const text = await response.text();
      throw new APIError(
        `${this.platformName} API error ${response.status}: ${text.slice(0, 500)}`,
        {
          platform: this.platformName,
          statusCode: response.status,
          rawResponse: parseJsonObject(text),
        }
      );
    }

    return response;
  }
}

export async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
