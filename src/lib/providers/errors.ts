export class ProviderError extends Error {
  platform: string;
  rawResponse: Record<string, unknown>;

  constructor(
    message: string,
    options: { platform?: string; rawResponse?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = "ProviderError";
    this.platform = options.platform ?? "";
    this.rawResponse = options.rawResponse ?? {};
  }
}

export class OAuthError extends ProviderError {
  constructor(message: string, options?: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, options);
    this.name = "OAuthError";
  }
}

export class TokenExpiredError extends ProviderError {
  constructor(message: string, options?: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, options);
    this.name = "TokenExpiredError";
  }
}

export class RateLimitError extends ProviderError {
  retryAfter?: number;

  constructor(
    message: string,
    options: ConstructorParameters<typeof ProviderError>[1] & {
      retryAfter?: number;
    } = {}
  ) {
    super(message, options);
    this.name = "RateLimitError";
    this.retryAfter = options.retryAfter;
  }
}

export class PublishError extends ProviderError {
  constructor(message: string, options?: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, options);
    this.name = "PublishError";
  }
}

/**
 * A publish failure raised strictly BEFORE the provider's final "publish"
 * call (media fetch, container create/processing). Nothing was published, so
 * the failure is definite and safe to classify as a provider failure instead
 * of unknown-delivery. Only throw this where that ordering is provable.
 */
export class PrePublishError extends PublishError {
  constructor(message: string, options?: ConstructorParameters<typeof ProviderError>[1]) {
    super(message, options);
    this.name = "PrePublishError";
  }
}

export class APIError extends ProviderError {
  statusCode?: number;

  constructor(
    message: string,
    options: ConstructorParameters<typeof ProviderError>[1] & {
      statusCode?: number;
    } = {}
  ) {
    super(message, options);
    this.name = "APIError";
    this.statusCode = options.statusCode;
  }
}
