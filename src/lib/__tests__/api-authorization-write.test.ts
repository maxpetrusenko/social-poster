import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireApiSession: vi.fn(async () => NextResponse.json({ error: "no session" }, { status: 401 })),
}));
vi.mock("@/lib/tenancy", () => ({
  requireTenantContext: vi.fn(),
  canManageCurrentWorkspace: () => true,
  canManageOrganization: () => true,
  canEditCurrentWorkspaceContent: () => true,
  canPublishCurrentWorkspaceContent: () => true,
}));

const keyState = vi.hoisted(() => ({ permission: "read" }));
vi.mock("@/lib/api-key-auth", () => ({
  validateApiKey: vi.fn(async () => ({
    apiKeyId: "k", workspaceId: "w1", scope: "all", permission: keyState.permission, userId: "u1",
  })),
  buildTenantFromApiKey: vi.fn(async () => ({ currentWorkspace: { id: "w1" }, user: { id: "u1" } })),
}));

describe("manager API authorization", () => {
  it("rejects a read-only key on mutating manager routes with 403", async () => {
    keyState.permission = "read";
    const { requireApiWorkspaceManager } = await import("@/lib/api-authorization");
    const res = await requireApiWorkspaceManager();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(403);
  });

  it("allows read keys on the explicit read variant and read_write on mutations", async () => {
    const { requireApiWorkspaceManager, requireApiWorkspaceManagerRead } = await import("@/lib/api-authorization");
    keyState.permission = "read";
    expect(await requireApiWorkspaceManagerRead()).not.toBeInstanceOf(NextResponse);
    keyState.permission = "read_write";
    expect(await requireApiWorkspaceManager()).not.toBeInstanceOf(NextResponse);
  });
});
