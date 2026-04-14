# Provider Architecture

Last updated: 2026-04-13

## Purpose

Define a single provider model for publishing and engagement so manual paths, cron paths, and future queue dispatch all behave the same way.

Reference code:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/pipeline/publisher.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/publish/zernio.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/replies/bird.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/publish/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/schedule-jobs.ts`

## Current Problem

The app currently mixes three concerns:
- social account identity
- delivery provider choice
- capability assumptions

Symptoms:
- hardcoded account IDs in `publisher.ts`
- provider-specific behavior leaking into route handlers
- manual and cron flows historically drifting
- X reply engine using Bird while post publishing uses Late

## Design Rule

Social account is the business object.
Provider is only the transport implementation.

That means:
- UI chooses a social account
- publisher resolves the account's capabilities and credentials
- dispatch layer chooses the provider adapter
- provider adapter returns a normalized result

## Target Layers

### 1. Account Layer

Owned by schema:
- `social_accounts`
- `social_account_credentials`
- `social_account_capabilities`
- `social_account_health`

Responsibilities:
- identify the account
- define what the account can do
- define how to authenticate
- expose health and last-known issues

### 2. Publish Intent Layer

New internal model:

```ts
type PublishIntent = {
  workspaceId: string;
  postId: string;
  socialAccountId: string;
  content: string;
  mediaItems: Array<{
    kind: "image" | "video";
    url: string;
    altText?: string | null;
  }>;
  publishMode: "manual" | "scheduled" | "api";
  scheduledFor?: Date | null;
  metadata?: Record<string, unknown>;
};
```

Responsibilities:
- describe what should be published
- stay provider-agnostic
- be created by manual publish, cron, queue, or future approvals release

### 3. Provider Adapter Layer

Example adapters:
- `latePublisher`
- `birdPublisher`
- `directLinkedInPublisher`
- `directXPublisher`

Responsibilities:
- take a `PublishIntent`
- take resolved account credentials
- perform provider-specific request/response mapping
- return normalized result

### 4. Result Normalization Layer

New shared result shape:

```ts
type PublishOutcome = {
  success: boolean;
  provider: string;
  platform: string;
  socialAccountId: string;
  externalPostId?: string;
  externalPostUrl?: string;
  externalRequestId?: string;
  classification:
    | "success"
    | "duplicate"
    | "rate_limited"
    | "validation_error"
    | "auth_error"
    | "provider_error"
    | "network_error";
  message?: string;
  raw?: unknown;
};
```

Responsibilities:
- classify provider outcomes
- preserve enough raw detail for debugging
- feed audit tables and dashboard state

## Provider Selection Rules

### Posts

Default:
- choose the provider configured on the social account

Examples:
- X image post via `late` or `direct_x`
- LinkedIn image post via `late` or `direct_linkedin`
- Instagram image/video via `late`

### Replies

Default:
- keep Bird for X replies until inbox/account unification is built

Rule:
- reply engine still uses the same account lookup and capability check path
- only the transport adapter differs

## Capability Rules

Never infer capability from platform name alone.

Must come from `social_account_capabilities`, for example:
- `can_publish_image`
- `can_publish_video`
- `can_publish_reply`
- `can_schedule`
- `can_read_inbox`

Implication:
- "enable image posts only, not video" becomes a data and validation rule
- scheduler and composer must read the same flags

## Account Resolution Rules

Bad:
- `ACCOUNT_IDS` map in code
- fallback to platform name only

Good:
- resolve `social_account_id`
- load account row
- load active credential row
- load capability row
- fail fast if account is disabled, unhealthy, or unsupported for the requested action

## Publish Entry Points

All of these must converge on the same internal service:
- manual post publish endpoint
- scheduled post runner
- queue/slot dispatcher
- approval release action

Proposed internal entry:

```ts
publishPostIntent(intent: PublishIntent): Promise<PublishOutcome>
```

Higher-level helpers can exist, but must build an intent and call the same core path.

## Error Classification Rules

Provider errors must be normalized into a small stable set.

Required classes:
- `duplicate`
- `rate_limited`
- `validation_error`
- `auth_error`
- `provider_error`
- `network_error`

Examples:
- provider `409 duplicate` -> `duplicate`
- LinkedIn `429 daily limit reached` -> `rate_limited`
- missing account credential -> `auth_error`
- malformed media payload -> `validation_error`

## Audit Requirements

Each publish outcome should persist:
- provider name
- request mode
- account id
- post id
- normalized classification
- provider message
- external post id
- external post url
- raw payload snapshot when safe

This is required for operator trust.

## Recommended File Boundaries

Target split:
- `src/lib/providers/types.ts`
- `src/lib/providers/resolve-account.ts`
- `src/lib/providers/publish-intent.ts`
- `src/lib/providers/late/publish.ts`
- `src/lib/providers/bird/reply.ts`
- `src/lib/providers/normalize-outcome.ts`

Avoid:
- adding more branches inside route handlers
- embedding provider-specific request bodies in UI code
- keeping hardcoded account maps after schema v1 lands

## Migration Sequence

1. keep current publishing behavior working
2. introduce provider types and normalized result objects
3. move manual publish route to shared publish service
4. move scheduled runners to the same service
5. replace hardcoded account maps with `social_accounts`
6. add capability gating
7. persist normalized publish attempts

## Definition Of Done

Provider architecture is done when:
- there is one publish contract
- manual and scheduled posts share it
- account IDs are no longer hardcoded in code
- capability gating happens before provider calls
- normalized outcomes drive status and audit views
