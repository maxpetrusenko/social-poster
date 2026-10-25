import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  claudeArgs,
  codexArgs,
  runClaudeCli,
  runCodexCli,
  stripEnv,
} from "./cli-providers.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-prov-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function fakeBin(name: string, body: string) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return file;
}

describe("cli providers", () => {
  it("claude: prompt on stdin, API creds stripped, JSON result returned", async () => {
    const bin = fakeBin(
      "claude-ok",
      `let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        process.stdout.write(JSON.stringify({result:JSON.stringify({stdin:d,key:process.env.ANTHROPIC_API_KEY||null,tok:process.env.ANTHROPIC_AUTH_TOKEN||null,oauth:process.env.CLAUDE_CODE_OAUTH_TOKEN||null})}))})`
    );
    const out = await runClaudeCli("hello prompt", {
      bin,
      env: { PATH: process.env.PATH, ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t", CLAUDE_CODE_OAUTH_TOKEN: "o" },
    });
    expect(JSON.parse(out)).toEqual({ stdin: "hello prompt", key: null, tok: null, oauth: "o" });
  });

  it("codex: strips OPENAI_API_KEY", async () => {
    const bin = fakeBin(
      "codex-ok",
      `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(String(process.env.OPENAI_API_KEY)))`
    );
    const out = await runCodexCli("p", { bin, env: { PATH: process.env.PATH, OPENAI_API_KEY: "sk" } });
    expect(out).toBe("undefined");
  });

  it("missing binary rejects with a clear reason", async () => {
    await expect(runClaudeCli("p", { bin: path.join(dir, "nope") })).rejects.toThrow(/not found/);
  });

  it("timeout kills a hung child and rejects", async () => {
    const bin = fakeBin("codex-hang", `setInterval(()=>{},1000)`);
    await expect(runCodexCli("p", { bin, timeoutMs: 200 })).rejects.toThrow(/timed out/);
  });

  it("claude reports is_error as a failure", async () => {
    const bin = fakeBin("claude-err", `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({is_error:true,result:"Not logged in"})))`);
    await expect(runClaudeCli("p", { bin })).rejects.toThrow(/Not logged in/);
  });

  it("invocations disable tools/MCP and sandbox codex", () => {
    const c = claudeArgs();
    expect(c).toContain("--strict-mcp-config");
    expect(c[c.indexOf("--tools") + 1]).toBe("");
    for (const t of ["Bash", "Edit", "Write", "WebFetch"]) expect(c).toContain(t);
    expect(codexArgs()).toEqual(expect.arrayContaining(["--sandbox", "read-only"]));
  });

  it("stripEnv does not mutate its input", () => {
    const env = { A: "1", B: "2" };
    expect(stripEnv(env, ["A"])).toEqual({ B: "2" });
    expect(env.A).toBe("1");
  });
});
