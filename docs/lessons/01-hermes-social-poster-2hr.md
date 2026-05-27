# Lesson 1: Install Hermes and Publish Through Social Poster

Date: 2026-05-27

Duration: 2 hours

Audience: builders using macOS, Linux, or WSL2 who can use a terminal and browser. Windows native users can follow the Hermes PowerShell path, but WSL2 is the steadier route.

## Outcome

By the end, each learner has:

- one agent CLI installed: Codex or Cursor Agent
- Hermes Agent installed and passing `hermes doctor`
- Social Poster opened in a browser
- one social account connected by the user
- one test post created in Social Poster
- one publish attempt completed or intentionally stopped before clicking Publish
- evidence captured in `/dashboard/pipeline` or `/dashboard/logs`

## Safety Boundary

This lesson teaches Hermes-assisted posting through Social Poster. It does not teach bypassing Social Poster with raw social platform tokens.

The user must connect their own social account in Social Poster. Hermes may help draft, inspect, and navigate, but the human must approve any public publish.

Recommended practice account: X, LinkedIn personal, or a private/test social account. Use harmless copy:

```text
Testing my Social Poster workshop setup. This is a short manual test post.
```

## Prep

Facilitator:

- Confirm Social Poster is reachable: `https://social.maxpetrusenko.com`
- Keep one known-good account connection ready for demo only.
- Do not lend platform cookies or API keys to students.
- Keep a rollback note: delete the test post from the social platform if needed.

Learner:

- Git installed: `git --version`
- A browser logged into the social account they want to connect.
- One of: ChatGPT/Codex access, Cursor access, Nous/OpenAI/OpenRouter/Gemini key, or the FreeLLMAPI add-on from lesson 3.

## Timeline

| Time | Block | Deliverable |
| --- | --- | --- |
| 0:00-0:10 | Orientation | Safety boundary understood |
| 0:10-0:25 | Install Codex or Cursor Agent | `codex --version` or Cursor Agent CLI version works |
| 0:25-0:45 | Install Hermes | `hermes version` and `hermes doctor` work |
| 0:45-1:05 | Configure Hermes model | `hermes -z "Reply with hermes-ready"` works |
| 1:05-1:25 | Connect Social Poster account | connected account visible |
| 1:25-1:50 | Create and publish test post | draft or published post exists |
| 1:50-2:00 | Verify and cleanup | pipeline/log evidence captured |

## Block 1: Install One Coding Agent CLI

Choose Codex or Cursor Agent. You do not need both.

### Option A: Codex CLI

Official install path:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex
```

First run prompts for ChatGPT or API-key auth.

Verify:

```bash
codex --version
```

### Option B: Cursor Agent CLI

Official install path:

```bash
curl https://cursor.com/install -fsS | bash
```

If needed, add the installed binary path:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```bash
agent --version || cursor-agent --version || cursor --version
```

Cursor's standalone agent binary name can vary by install channel. Use the command that exists on the learner machine for the rest of the lesson.

## Block 2: Install Hermes Agent

Official macOS, Linux, and WSL2 install path:

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.zshrc 2>/dev/null || source ~/.bashrc
```

Verify:

```bash
hermes version
hermes doctor
```

If `hermes` is not found:

```bash
export PATH="$HOME/.local/bin:$PATH"
hermes version
```

## Block 3: Configure Hermes

Paid/simple path:

```bash
hermes setup --portal
```

Standard provider setup:

```bash
hermes setup model
hermes tools
```

Smoke test:

```bash
hermes -z "Reply with exactly: hermes-ready"
```

Expected output:

```text
hermes-ready
```

If a learner has no paid subscription or provider key, use `03-free-llmapi-hermes-add-on.md`.

## Block 4: Connect A Social Account

Open Social Poster:

```text
https://social.maxpetrusenko.com
```

Connect account:

1. Sign in.
2. Open `/dashboard/workspace-settings/social-accounts`.
3. Pick a platform.
4. Complete OAuth or supported connection flow in the browser.
5. Return to Social Poster and confirm the connected row is enabled.

Checks:

- Connected account has the expected handle.
- It is enabled.
- The post composer can select it.

If OAuth fails:

- Try the same flow in a clean browser profile.
- Confirm the redirect URI shown in the setup guide matches the provider portal.
- Stop before changing app secrets.

## Block 5: Use Hermes To Prepare The Post

Run Hermes from any working directory:

```bash
hermes -z "Create a short test post for Social Poster. Tone: simple, no hashtags, no emoji. Include one sentence only."
```

Use the output as the post body.

Optional stronger prompt:

```bash
hermes -z "Create a safe workshop test post for a social automation platform. It must say it is a test. No claims, no hashtags, no emoji, under 180 chars."
```

## Block 6: Publish Through Social Poster

Open:

```text
/dashboard/posts/create
```

Steps:

1. Paste the Hermes-generated copy.
2. Select the connected account.
3. Read the preview.
4. For a safer workshop path, choose Draft first and inspect the saved post.
5. If publishing publicly, choose Publish Now and click Publish only if the account and copy are correct.

If using a real account, the facilitator should say this out loud before publish:

```text
This will post publicly from the selected account. Confirm the account, text, and platform before clicking Publish.
```

Important product boundary: Hermes is only generating the copy in this lesson. Social Poster performs the account-scoped publish through its composer and publish route.

## Block 7: Verify

Open:

```text
/dashboard/pipeline
/dashboard/logs
```

Capture:

- post title or body
- target platform
- status: `published`, `partial_failure`, or error
- published URL if available
- exact error if failed

Done condition:

- Preferred: test post is published and visible on the platform.
- Acceptable: post was created and stopped before publish by explicit choice.
- Not done: Hermes generated text only, with no Social Poster draft/publish action.

## Instructor Notes

Current Social Poster architecture keeps posting inside the product flow. Social Agent safe internal tools are deliberately narrow. Real publishing goes through the authenticated post publish route and platform connection state.

Use this phrasing when learners ask why Hermes cannot just post directly:

```text
Hermes can help, but Social Poster owns the publish boundary. Account auth, workspace scope, audit trail, preview, and the Publish click all live there.
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `codex` missing | PATH not reloaded | open new shell or export `~/.local/bin` |
| Cursor CLI missing | Cursor CLI PATH or binary name differs | add `~/.local/bin`, then try `agent`, `cursor-agent`, or `cursor` |
| `hermes` missing | shell not reloaded | `export PATH="$HOME/.local/bin:$PATH"` |
| Hermes auth fails | no provider configured | run `hermes setup model` or lesson 3 |
| Social account not visible | OAuth did not complete | reconnect and confirm enabled row |
| Publish fails | token/provider/media issue | copy exact error from pipeline/logs |

## References

- OpenAI Codex CLI: `https://developers.openai.com/codex/cli`
- Cursor CLI install: `https://cursor.com/docs/cli/installation`
- Hermes install: `https://hermes-agent.nousresearch.com/docs/getting-started/installation/`
- Local Social Poster docs: `docs/hermes/agent-setup.md`, `docs/tasks.md`
