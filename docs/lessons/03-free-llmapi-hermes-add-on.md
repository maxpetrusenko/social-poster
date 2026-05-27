# Add-On: FreeLLMAPI With Hermes For Learners Without Paid Subscriptions

Date: 2026-05-27

Duration: 45-60 minutes standalone, or 20 minutes if keys are ready.

Audience: learners who do not have ChatGPT/Cursor/Nous/OpenAI paid access and need a local OpenAI-compatible endpoint for Hermes practice.

## Outcome

By the end, each learner has:

- FreeLLMAPI running locally
- at least one upstream free-tier provider key added
- a unified `freellmapi-...` key
- Hermes configured with a custom provider pointing at FreeLLMAPI
- a smoke test proving Hermes can call it

## Reality Check

FreeLLMAPI is useful for learning, workshops, and personal experiments. It is not a production-quality substitute for paid inference.

Expected tradeoffs:

- free tiers change
- rate limits hit quickly
- latency varies
- model quality degrades as the best free quotas are exhausted
- no SLA
- provider terms still apply

Do not expose your FreeLLMAPI endpoint publicly. Do not share upstream provider keys.

## Install FreeLLMAPI

Prerequisite: Node.js 20+.

```bash
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
npm install
cp .env.example .env
echo "ENCRYPTION_KEY=$(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" >> .env
npm run dev
```

Keep that server running. Use a second terminal for the curl and Hermes commands below.

Open:

```text
http://localhost:5173
```

Add provider keys on the Keys page, then copy the unified FreeLLMAPI key from the UI.

API endpoint:

```text
http://localhost:3001/v1
```

Smoke test:

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer freellmapi-your-unified-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Reply with freellmapi-ready"}]
  }'
```

## Configure Hermes Custom Provider

Open Hermes config:

```bash
hermes config edit
```

Add or update:

```yaml
custom_providers:
  - name: freellmapi
    base_url: http://localhost:3001/v1
    key_env: FREELLMAPI_API_KEY
    model: auto
    api_mode: chat_completions

model:
  default: auto
  provider: custom:freellmapi
  base_url: http://localhost:3001/v1
```

Add the key to Hermes secrets:

```bash
echo 'FREELLMAPI_API_KEY=freellmapi-your-unified-key' >> "$(hermes config env-path)"
```

Then run:

```bash
hermes config check
hermes model
```

Pick the `freellmapi` custom provider if prompted.

Smoke test:

```bash
hermes -z "Reply with exactly: hermes-free-ready"
```

Expected:

```text
hermes-free-ready
```

## If Hermes Cannot List Models

FreeLLMAPI supports `model: auto`. If model listing fails but chat completions work, keep `auto` as the configured model and test with `hermes -z`.

If Hermes says the endpoint cannot be reached:

- confirm FreeLLMAPI server is on port `3001`
- confirm dashboard is on port `5173`
- confirm the base URL ends in `/v1`
- confirm the key starts with `freellmapi-`
- retry the curl smoke test outside Hermes

## Workshop Use

Use this setup for:

- Lesson 1 Hermes smoke test
- generating test post copy
- summarizing repo findings
- drafting PR request text

Avoid using it for:

- production publishing decisions
- long autonomous repo edits
- security-sensitive code review
- anything that requires high reasoning reliability

## References

- FreeLLMAPI README: `https://github.com/tashfeenahmed/freellmapi`
- Hermes custom provider behavior verified from local Hermes config and tests.
