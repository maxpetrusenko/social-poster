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

  it("uses BuildKit npm cache mounts", () => {
    const dockerfile = fs.readFileSync(
      path.join(process.cwd(), "Dockerfile"),
      "utf8"
    );

    expect(dockerfile).toContain("# syntax=docker/dockerfile:");
    expect(dockerfile).toContain("--mount=type=cache,target=/root/.npm");
  });

  it("keeps Coolify compose deploys on the prebuilt GHCR image", () => {
    const compose = fs.readFileSync(
      path.join(process.cwd(), "docker-compose.yml"),
      "utf8"
    );

    expect(compose).toContain(
      "image: ${SOCIAL_POSTER_IMAGE:-ghcr.io/maxpetrusenko/social-poster:main}"
    );
    expect(compose).toContain("pull_policy: always");
    expect(compose).not.toContain("build:");
    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("http://127.0.0.1:3000/api/health");
  });
});
