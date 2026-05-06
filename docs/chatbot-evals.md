---
summary: "Manatee chatbot eval setup for SMM Agent."
read_when:
  - Testing the dashboard chatbot
  - Updating social-agent behavior
  - Debugging Manatee reports
---

# Chatbot Evals

Manatee tests the dashboard chatbot through `/api/social-agent`.

## Local Run

Start the app in an isolated local process:

```bash
OPENAI_API_KEY="$(doppler secrets get OPENAI_API_KEY --project api_keys --config dev --plain)" \
DISABLE_AUTH=true \
DATABASE_URL=/tmp/social-poster-manatee.sqlite \
LINEAR_API_KEY= \
LINEAR_SUPPORT_TEAM_ID= \
LINEAR_SUPPORT_PROJECT_ID= \
LINEAR_SUPPORT_PROJECT_NAME= \
LINEAR_SUPPORT_LABEL_IDS= \
SUPPORT_BOT_TOKEN= \
npm run dev -- -p 3010
```

Run replay:

```bash
OPENAI_API_KEY="$(doppler secrets get OPENAI_API_KEY --project api_keys --config dev --plain)" \
MANATEE_BOT_URL=http://localhost:3010 \
npm run manatee:test
```

Regenerate personas or baseline only when chatbot behavior or product scope changes:

```bash
npm run manatee:personas
npm run manatee:discover
```

## Notes

- Manatee `0.8.0` sends `max_tokens`, so OpenAI GPT-5 models reject it. Use `gpt-4.1-mini` until Manatee updates its OpenAI client.
- `manatee.config.mjs` owns the API contract and deterministic guardrails.
- `manatee-eval.json` is the replay baseline.
- Reports write to `result.json`, `manatee-report.md`, `manatee-report.html`, and `manatee-results/`.
