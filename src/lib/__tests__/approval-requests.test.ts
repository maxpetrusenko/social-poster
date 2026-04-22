import { afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

type TestDb = typeof import("./approval-requests.test-db").testDb;

const state = vi.hoisted(() => ({
  sqlite: null as null | { exec: (sql: string) => unknown },
  testDb: null as null | TestDb,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const db = await import("@/lib/__tests__/approval-requests.test-db");
  state.sqlite = db.sqlite;
  state.testDb = db.testDb;
  return { db: state.testDb };
});

import {
  getLatestApprovalRequestForPost,
  requestApprovalForPost,
  resolveApprovalRequestForPost,
} from "@/lib/approval-requests";

afterEach(() => {
  state.sqlite?.exec(`
    DELETE FROM approval_requests;
    DELETE FROM posts;
    DELETE FROM workspaces;
    DELETE FROM organizations;
  `);
});

describe("approval requests", () => {
  it("creates a request and updates an existing open request in place", async () => {
    await seedPost("workspace-1", "post-1");

    const first = await requestApprovalForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      requestedByUserId: null,
      policySnapshot: { approvalWorkflowMode: "required_internal" },
    });

    const second = await requestApprovalForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      requestedByUserId: null,
      policySnapshot: { approvalWorkflowMode: "required_internal_and_client" },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.approvalRequest.id).toBe(first.approvalRequest.id);
    expect(second.approvalRequest.approvalState).toBe("requested");

    const latest = await getLatestApprovalRequestForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
    });

    expect(latest?.policySnapshot).toMatchObject({
      approvalWorkflowMode: "required_internal_and_client",
    });
  });

  it("approves an open request so publish can proceed", async () => {
    await seedPost("workspace-1", "post-1");
    await requestApprovalForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      requestedByUserId: null,
      policySnapshot: { approvalWorkflowMode: "required_internal" },
    });

    const result = await resolveApprovalRequestForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      decidedByUserId: "user-1",
      decision: "approved",
    });

    expect(result.updated).toBe(true);
    expect(result.approvalRequest?.approvalState).toBe("approved");
    expect(result.approvalRequest?.isResolved).toBe(true);
    expect(result.approvalRequest?.resolvedAt).toBeInstanceOf(Date);
  });

  it("marks a request as changes requested without resolving it", async () => {
    await seedPost("workspace-1", "post-1");
    await requestApprovalForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      requestedByUserId: null,
      policySnapshot: { approvalWorkflowMode: "required_internal" },
    });

    const result = await resolveApprovalRequestForPost({
      workspaceId: "workspace-1",
      postId: "post-1",
      decidedByUserId: "user-1",
      decision: "changes_requested",
    });

    expect(result.updated).toBe(true);
    expect(result.approvalRequest?.approvalState).toBe("changes_requested");
    expect(result.approvalRequest?.isOpen).toBe(true);
    expect(result.approvalRequest?.resolvedAt).toBeNull();
  });
});

async function seedPost(workspaceId: string, postId: string) {
  const now = new Date("2026-04-21T12:00:00.000Z");
  const testDb = getTestDb();

  await testDb.insert(schema.organizations).values({
    id: "org-1",
    name: "Org 1",
    slug: "org-1",
    logoUrl: null,
    defaultTimezone: "UTC",
    plan: "free",
    planLabel: "Free",
    maxProfiles: 5,
    maxPlatforms: 3,
    maxPostsPerMonth: 50,
    billingEmail: null,
    billingCycleStart: null,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  await testDb.insert(schema.workspaces).values({
    id: workspaceId,
    organizationId: "org-1",
    name: "Workspace 1",
    slug: workspaceId,
    description: "",
    timezone: "UTC",
    iconUrl: null,
    primaryColor: "",
    secondaryColor: "",
    defaultHashtags: [],
    defaultFirstComment: "",
    approvalWorkflowMode: "required_internal",
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  await testDb.insert(schema.posts).values({
    id: postId,
    workspaceId,
    profileId: null,
    title: "Approval target",
    content: "Post content",
    contentType: "text",
    mediaUrl: null,
    sourceUrl: null,
    sourceTitle: null,
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    dedupKey: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });
}

function getTestDb() {
  if (!state.testDb) {
    throw new Error("Test database was not initialized");
  }
  return state.testDb;
}
