import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker build", () => {
  it("keeps Coolify output alive during quiet Next builds", () => {
    const dockerfile = fs.readFileSync(
      path.join(process.cwd(), "Dockerfile"),
      "utf8"
    );

    expect(dockerfile).toContain('echo "next build still running"');
    expect(dockerfile).toContain("heartbeat_pid");
    expect(dockerfile).toContain("kill \"$heartbeat_pid\"");
  });
});
