import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const exporter = join(process.cwd(), "scripts/export-medium-public-preview.mjs");
const verifier = join(process.cwd(), "scripts/verify-medium-public-preview.mjs");
const cleanup: string[] = [];

function makePackage() {
  const root = mkdtempSync(join(tmpdir(), "medium-preview-hash-"));
  cleanup.push(root);
  const packageDir = join(root, "hash-test");
  const siteRoot = join(root, "site");
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(join(packageDir, "evals"), { recursive: true });
  mkdirSync(join(siteRoot, "public", "medium"), { recursive: true });
  const article = Buffer.from("# Hash Test\n\nExact bytes.\n", "utf8");
  writeFileSync(join(packageDir, "article-v1.md"), article);
  writeFileSync(join(packageDir, "version.json"), JSON.stringify({
    slug: "hash-test",
    articleFile: "article-v1.md",
  }));
  writeFileSync(join(packageDir, "workflow.json"), "{}");
  const hash = createHash("sha256").update(article).digest("hex");
  writeFileSync(join(packageDir, "evals", "title-v1.json"), JSON.stringify({
    articleFile: "article-v1.md",
    articleHash: hash,
    candidates: Array.from({ length: 10 }, (_, index) => `Candidate ${index + 1}`),
    selected: { titleScore: 9.3, subtitleScore: 9.2 },
  }));
  writeFileSync(join(packageDir, "evals", "prepublish-v1.json"), JSON.stringify({
    articleFile: "article-v1.md",
    articleHash: hash,
    status: "ready",
    overallScore: 9.5,
    blockers: [],
  }));
  writeFileSync(join(packageDir, "evals", "rating-v1.json"), JSON.stringify({
    articleFile: "article-v1.md",
    articleHash: hash,
    score: 9.5,
    blockers: [],
  }));
  return {
    packageDir,
    siteRoot,
    hash,
  };
}

afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe("Medium public preview article hash binding", () => {
  it("exports the exact Markdown byte hash into HTML and the preview manifest", async () => {
    const fixture = makePackage();

    await execFileAsync(process.execPath, [
      exporter,
      "--package", fixture.packageDir,
      "--site-root", fixture.siteRoot,
    ]);

    const outputDir = join(fixture.siteRoot, "public", "medium", "hash-test");
    const html = readFileSync(join(outputDir, "index.html"), "utf8");
    const manifest = JSON.parse(readFileSync(join(outputDir, "preview-manifest.json"), "utf8"));
    expect(html).toContain(`<meta name="source-article-sha256" content="${fixture.hash}">`);
    expect(manifest.articleHash).toBe(fixture.hash);
  });

  it("accepts an exact fetched hash and rejects a missing or wrong hash", async () => {
    const fixture = makePackage();
    let hashMeta = `<meta name="source-article-sha256" content="${fixture.hash}">`;
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<html><head><meta name="robots" content="noindex,nofollow">${hashMeta}<title>Hash Test</title></head><body>Exact bytes.</body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const success = await execFileAsync(process.execPath, [
        verifier,
        "--package", fixture.packageDir,
        "--public-base-url", baseUrl,
        "--marker", "Exact bytes.",
      ]);
      expect(success.stdout).toContain(`articleHash=${fixture.hash}`);

      hashMeta = "";
      await expect(execFileAsync(process.execPath, [
        verifier,
        "--package", fixture.packageDir,
        "--public-base-url", baseUrl,
        "--marker", "Exact bytes.",
      ])).rejects.toMatchObject({ stderr: expect.stringContaining("missing source article hash meta") });

      hashMeta = `<meta name="source-article-sha256" content="${"0".repeat(64)}">`;
      await expect(execFileAsync(process.execPath, [
        verifier,
        "--package", fixture.packageDir,
        "--public-base-url", baseUrl,
        "--marker", "Exact bytes.",
      ])).rejects.toMatchObject({ stderr: expect.stringContaining("source article hash mismatch") });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
