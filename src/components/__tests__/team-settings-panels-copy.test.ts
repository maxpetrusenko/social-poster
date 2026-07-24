import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const panelsSource = readFileSync(
  join(process.cwd(), "src/components/dashboard/team-settings-panels.tsx"),
  "utf8"
);
const modalSource = readFileSync(
  join(process.cwd(), "src/components/dashboard/user-invite-modal.tsx"),
  "utf8"
);
const actionsSource = readFileSync(
  join(process.cwd(), "src/app/dashboard/settings/actions.ts"),
  "utf8"
);

describe("team settings access copy", () => {
  it("frames invitations as user access in the settings UI", () => {
    expect(panelsSource).toContain('title="Users"');
    expect(panelsSource).toContain("<UserInviteModal />");
    expect(panelsSource).toContain("Admin can manage users and invites. User can access SMM Agent.");
    expect(panelsSource).toContain('title="Pending Access"');
    expect(modalSource).toContain("Invite User");
    expect(modalSource).toContain('name="emails"');
    expect(modalSource).toContain('<option value="member">User</option>');
    expect(modalSource).toContain('<option value="admin">Admin</option>');
    expect(panelsSource).not.toContain('title="Invite Member"');
    expect(panelsSource).not.toContain('title="Pending Invites"');
    expect(panelsSource).not.toContain('eyebrow="Settings / Users"');
    expect(panelsSource).not.toContain("Send access, resend links, revoke pending invites, and manage account roles from one place.");
    expect(panelsSource).not.toContain('name={`ws_${workspace.id}`}');
    expect(panelsSource).not.toContain('name={`ws_role_${workspace.id}`}');
    expect(modalSource).not.toContain('name={`ws_${workspace.id}`}');
    expect(modalSource).not.toContain('name={`ws_role_${workspace.id}`}');
    expect(actionsSource).toContain('role: "editor" as const');
    expect(actionsSource).not.toContain('role: "viewer" as const');
  });

  it("frames the accept page as opening SMM Agent", () => {
    expect(panelsSource).toContain('eyebrow="Access"');
    expect(panelsSource).toContain('title="Start using SMM Agent"');
    expect(panelsSource).toContain("Open SMM Agent");
    expect(panelsSource).toContain('title="Access Details"');
    expect(panelsSource).not.toContain("Accept invite");
    expect(panelsSource).not.toContain("Sign in to accept");
    expect(panelsSource).toContain("Use a different Google account");
    expect(panelsSource).toContain("switchAccountHref");
  });
});
