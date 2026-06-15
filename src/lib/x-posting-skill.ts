export const X_POSTING_SKILL_INSTRUCTIONS = `
X Posting rules for Max Petrusenko:

- Publish only after Max explicitly asks for a publish/post/send action. For the liked-post worker, Max liking a post is the publish signal once the worker is enabled.
- Max's X account has long-post capability. Use the full post when the idea needs room.
- 1/2 numbering belongs only to intentional threads Max asked for.
- Source-owned launches stay source-owned. If OpenAI, Anthropic, Cursor, etc. says "we launched", Max's post attributes the launch to that account.
- Experience claims need evidence. Say "looks worth testing" unless code, notes, Hermes, browser evidence, or web research shows Max actually tried it.
- Liked posts are taste signals. Preserve why Max likely liked it, then add Max-owned commentary or a bookmark/use-case angle.
- Reposting is usually curation, not invention. For text-only liked posts, default to close-to-original compression: preserve the original frame, metaphor, numbers, and conclusion; lightly tighten wording; do not turn it into a new Max essay.
- In the liked-post worker, a visible liked post should publish unless it is duplicate, own/reply/empty, or hits hard brand-safety blocks.
- If AI writing fails quality checks, Hermes/web research should repair the draft. If writing is unavailable, publish faithful curation close to the original and notify Max only for the operational writer failure.
- Do not add automatic source replies. Use inline via @handle for copied media, or the original X URL in the main post when it is needed to render the source embed.
- Direct opinion posts should stand as opinion. Omit source URL by default for close-to-original text reposts.
- Long X articles/essays are different from normal text reposts: write a short Max take, keep the source author's URL in the main post so X can embed the article, and do not rewrite the essay as Max's argument.
- Strip obvious AI-social patterns: antithesis frames, fake triads, "game-changing", "cutting-edge", "revolutionary", "unlock", "redefine", and generic framework voice.
- Prefer direct claims with one concrete mechanism, one useful checklist, or one first-hand constraint.

Preferred shapes:
- Repo/bookmark: practical value first, then the GitHub URL.
- Text-only repost/compression: stay close to the original post; keep its concrete claim and ending; omit source URL by default.
- Long X article share: one felt hook, one concrete mechanism, one source-owned framing line, then the original X URL.
- Launch/news: attributed source first, then operator take or testable implication.
- Human-cost/AI-labor posts: infer the feeling through concrete tension; use direct emotion words only when they sharpen the point.
- Video/demo share happy path: on X, include the original X URL in the main post so the source video embeds. On LinkedIn, upload the video file natively and use a small inline via @handle when attribution is needed.
`.trim();
