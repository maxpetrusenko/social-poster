import type { BlogPost } from "./posts";

export const SOURCE_OF_TRUTH_POSTS: BlogPost[] = [
  {
    slug: "ai-social-publishing-agent-source-of-truth",
    title: "AI Social Publishing Agent: The Source-of-Truth Guide",
    excerpt:
      "A practical guide to using an AI social publishing agent without turning your brand into a content spinner.",
    category: "Agent",
    publishedAt: "2026-04-22",
    imageUrl: "/blog/ai-social-publishing-agent.png",
    imageAlt: "AI social publishing command center with content queues and platform lanes.",
    isMarkdown: true,
    audiences: ["clawposter"],
    content: `# AI Social Publishing Agent: The Source-of-Truth Guide

> Definition: An AI social publishing agent is software that turns approved inputs, brand voice rules, platform constraints, schedules, and connected account permissions into publishable social posts. The useful version does not only generate captions. It adapts each post to the destination network, keeps an audit trail, and makes failure visible before content reaches the public feed.

Most teams buy automation because posting feels repetitive. Then they discover the real work was not repetition. It was judgment: what to say, which source to trust, which platform needs a different shape, when to pause, and how to avoid sounding like a machine that has never met the audience.

ClawPoster exists for that second problem. It treats automation as an operating system for social publishing, not a bulk caption button.

## The misconception

The common misconception is that social automation means writing one post and blasting it everywhere. That breaks quickly. X, LinkedIn, TikTok, YouTube, RSS-driven commentary, and image-led platforms expose different surfaces, limits, and API workflows. The [X API manage posts documentation](https://docs.x.com/x-api/posts/manage-tweets/introduction) is a different operating surface from [LinkedIn's Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [YouTube's videos.insert method](https://developers.google.com/youtube/v3/docs/videos/insert), or TikTok's [Content Posting API Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post).

The old way is one draft, one calendar, one publish button. The new way is one idea, many platform-native executions, each with its own checks.

## What the agent actually does

- Captures source material from manual prompts, RSS feeds, URLs, campaign notes, and reusable profile memory.
- Applies brand voice, positioning, forbidden topics, and workspace defaults.
- Generates platform-specific drafts instead of one universal caption.
- Routes drafts through review, edit, approval, scheduling, and publishing states.
- Logs each run so a failed post is a visible operations event, not a silent gap.
- Keeps related surfaces connected: [ClawPoster](https://clawposter.app), [SMMClaw](https://smmclaw.app), [SMMAgent](https://smmagent.app), the [app dashboard](https://social.maxpetrusenko.com), and the [Max Petrusenko tech projects page](https://www.maxpetrusenko.com/tech).

## Old way vs new way

Old way: A founder writes one LinkedIn post, trims it for X, rewrites it as an Instagram caption, forgets YouTube Shorts, skips replies, and calls the week inconsistent.

New way: The founder gives the system a source, an angle, and a profile. The agent creates the LinkedIn version, the X version, the short-video caption, the reply prompts, and the schedule. The operator reviews the queue instead of rebuilding the same idea five times.

This is not magic. It is a workflow boundary. The person supplies judgment. The agent supplies repetition, formatting, timing, and memory.

## Evidence from platform reality

Platform APIs prove the point. X exposes post management through its own endpoint family. LinkedIn distinguishes member and organization publishing through its marketing API. YouTube uploads video through a videos resource, with quota and privacy behavior that must be respected. TikTok separates publishing flows and direct posting requirements. A generic post cannot safely pretend those differences do not exist.

RSS adds a second layer. The [RSS 2.0 specification](https://www.rssboard.org/rss-specification) defines feed and item fields such as title, link, and description. That makes RSS useful as a source intake format, but it does not provide your opinion, your audience promise, or your platform-specific commentary. The agent has to add that layer.

## A real failure mode

The easiest failure is overconfident autonomy. If the agent pulls a news item, summarizes it, adds a punchy take, and publishes without review, it can ship stale context or a claim the source did not support. The rollback is boring and necessary: source links must remain attached, high-risk categories should require approval, and the publishing run should preserve enough trace data to see why the draft existed.

We learned to value the audit trail more than the perfect prompt. When a schedule fails, the useful question is not whether the model was clever. It is which input, model, provider, account, permission, or platform response caused the failure.

## Implementation map

1. Define profiles first. A profile should include voice, audience, topics, forbidden claims, preferred calls to action, and target platforms.
2. Connect sources second. RSS, URLs, notes, and campaign briefs should be stored as evidence, not pasted into a disappearing prompt.
3. Add platform adapters. Each destination needs length, media, tone, and format rules.
4. Add approval states. Draft, edited, approved, scheduled, published, failed, and skipped are different states.
5. Add provider and key controls. If a model key is missing or untested, the model should not be selectable for writing, replies, images, or agent runs.
6. Add health checks. A publish pipeline without test buttons, logs, and visible failures becomes a guessing game.

## Primary action

Build the smallest reliable loop: one profile, one source type, two platforms, one approval queue, and a visible publish log.

Secondary actions:

- Add RSS only after manual source drafts work.
- Add reply discovery only after outbound publishing is stable.
- Add autonomy only after failures are boring, traceable, and reversible.

## FAQ

> What is an AI social publishing agent? It is a workflow system that generates, adapts, schedules, and publishes social content through connected accounts while preserving brand voice, approval state, and operational logs.

> Why does it matter? It moves the bottleneck from manual formatting to editorial judgment. That is the only bottleneck worth keeping human.

> How does it work? It combines source intake, profile memory, model generation, platform adapters, scheduling, account permissions, and publishing logs.

> What are the risks? Weak sources, hallucinated claims, account permission failures, platform API changes, and over-automation. Every one needs a visible control.

## Conclusion

The tension is not automation versus authenticity. It is whether your system makes judgment easier or hides it. A good social agent does the mechanical work so the operator can spend more time on the point of view.

The uncomfortable part: automation does not fix a weak point of view; it only publishes it faster.`,
  },
  {
    slug: "platform-native-social-posting-guide",
    title: "Platform-Native Social Posting: Why One Draft Cannot Fit Every Network",
    excerpt:
      "A source-backed guide to adapting one idea into posts that respect each network's format, audience, and API reality.",
    category: "Features",
    publishedAt: "2026-04-22",
    imageUrl: "/blog/platform-native-social-posting.png",
    imageAlt: "One source idea splitting into multiple platform-native social post formats.",
    isMarkdown: true,
    audiences: ["clawposter"],
    content: `# Platform-Native Social Posting: Why One Draft Cannot Fit Every Network

> Definition: Platform-native social posting means adapting the same underlying idea to each network's format, audience behavior, media surface, and publishing constraints. It is not copy-paste distribution. It is translation: one source of truth becomes several posts that preserve the point while changing structure, length, media, and call to action.

The mistake is treating platforms as output folders. They are not. They are social environments with different incentives. LinkedIn rewards professional framing and context. X rewards compression and immediacy. YouTube requires video metadata and upload behavior. TikTok has publishing flows that are not the same as a text-first network.

ClawPoster's job is to keep the idea consistent while changing the delivery.

## The tension

Teams want consistency, but platforms punish sameness. If every account posts the same sentence, the brand looks efficient internally and lazy externally. If every platform is rewritten by hand, the team burns hours on formatting instead of strategy.

The practical answer is structured adaptation.

## What changes between networks

- Length: A short X post and a LinkedIn thought piece should not share the same pacing.
- Media: YouTube's [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) is a video upload workflow, not a caption-only workflow.
- Permissions: LinkedIn publishing depends on member or organization authorization through its [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api).
- Publishing rules: TikTok's [Direct Post API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) has a dedicated posting flow with platform-specific requirements.
- Conversation style: Replies need context and risk scoring. Broadcast posts need a clear standalone point.

## Old way vs new way

Old way: Write a post, paste it everywhere, edit only when a character limit blocks you.

New way: Store one idea as the source, then generate destination drafts through platform adapters. The source stays stable. The output changes.

Example:

- Source: A product learned that approval logs matter more than clever prompts.
- X: One sharp observation with a concrete failure.
- LinkedIn: A short narrative about why a team rolled back full autonomy.
- TikTok or Shorts: A caption tied to a 30-second operator walkthrough.
- Blog: A deeper source-of-truth explanation with links and implementation steps.

## The evidence layer

Platform docs are the best antidote to generic automation thinking. X, LinkedIn, YouTube, and TikTok do not expose one universal social API. They expose different endpoints, review requirements, media shapes, scopes, quotas, and errors. That means the product must model those differences.

RSS adds another useful constraint. The [RSS 2.0 spec](https://www.rssboard.org/rss-specification) gives structured feed items, but the item is not the post. The post needs the brand's interpretation. Without that, automation becomes headline recycling.

## Reality contact

The bad version of platform adaptation is fake localization. It adds hashtags, changes sentence length, and calls the result native. That fails because platform-native content is about intent, not decoration.

A practical rollback is to remove unsupported adapters. If the system cannot explain why a YouTube caption, LinkedIn post, or X reply differs from the source, it should stay in draft. Better fewer correct surfaces than many shallow ones.

## Implementation checklist

- Define a canonical idea object: source URL, claim, angle, audience, proof, and desired action.
- Create per-platform adapters with length, media, tone, risk, and link behavior.
- Store every generated variant separately.
- Show the operator all variants before approval.
- Block publishing when a platform account, permission, key, or media requirement is missing.
- Keep a link from each variant back to the original source.

## Primary action

Start with two adapters: one short-form text adapter and one professional-context adapter. Measure whether review time drops without weakening the posts.

Secondary actions:

- Add video caption support only when the media pipeline is stable.
- Add reply drafting only after outbound posts are consistently traceable.
- Add custom model selection only after keys can be tested and hidden after save.

## FAQ

> What is platform-native social posting? It is the practice of reshaping one source idea into posts that fit each network's format, audience, media surface, and publishing workflow.

> Why does it matter? Because sameness looks efficient in a dashboard but careless in a feed.

> How does it work? A system stores the source idea once, then uses adapters to generate separate drafts for each platform.

> What are the limits? Adapters cannot invent a good idea. They can only preserve and reshape one.

## Related pages

Read the product surface at [ClawPoster](https://clawposter.app), the agency surface at [SMMClaw](https://smmclaw.app), the agent surface at [SMMAgent](https://smmagent.app), the app dashboard at [social.maxpetrusenko.com](https://social.maxpetrusenko.com), and the broader tech portfolio at [Max Petrusenko Tech](https://www.maxpetrusenko.com/tech).

## Conclusion

The paradox is that a consistent brand must behave inconsistently across platforms. Same judgment. Different shape.

The uncomfortable part: if a post cannot survive translation, it was probably not a strong idea in the first place.`,
  },
  {
    slug: "social-media-automation-for-agencies-guide",
    title: "Social Media Automation for Agencies: Scale Output Without Losing Review",
    excerpt:
      "An agency-focused guide to using social automation for more client-ready work without hiding approvals, risk, or accountability.",
    category: "Teams",
    publishedAt: "2026-04-22",
    imageUrl: "/blog/agency-social-automation-table.png",
    imageAlt: "Agency social automation dashboard with client rows and approval status.",
    isMarkdown: true,
    audiences: ["smmclaw"],
    content: `# Social Media Automation for Agencies: Scale Output Without Losing Review

> Definition: Social media automation for agencies is a client-workflow system that turns brand profiles, source inputs, approval rules, schedules, and connected social accounts into repeatable publishing operations. The goal is not replacing account managers. The goal is increasing throughput while keeping client context, review state, and platform risk visible.

Agencies do not fail at social because they cannot write captions. They fail because every client adds a second calendar, a second voice, a second approval loop, and a second set of platform permissions. Work expands in rows, not in ideas.

SMMClaw is built around that agency reality.

## The misconception

The wrong promise is "do more posts with fewer people." That attracts churn. The better promise is "make every account manager operate with a cleaner system." Automation should reduce copy-paste labor, not erase accountability.

## Agency workflow map

- Client profile: voice, offer, audience, forbidden claims, competitors, approvals.
- Source intake: RSS, client notes, URLs, campaign docs, product updates.
- Draft generation: platform-specific versions with client context.
- Review queue: edit, approve, reject, or request revision.
- Schedule: recurring jobs and campaign drops.
- Publish log: account, platform, post, status, failure reason.
- Backlinks and surfaces: [SMMClaw](https://smmclaw.app), [ClawPoster](https://clawposter.app), [SMMAgent](https://smmagent.app), [social.maxpetrusenko.com](https://social.maxpetrusenko.com), and [Max Petrusenko Tech](https://www.maxpetrusenko.com/tech).

## Evidence from platform constraints

Client publishing depends on platform-specific permissions. LinkedIn's [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) handles member and organization publishing through its own marketing surface. X documents post creation through its [manage posts API](https://docs.x.com/x-api/posts/manage-tweets/introduction). YouTube upload behavior lives under [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert). TikTok has a [Direct Post API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post).

For an agency, those differences become operational risk. A missing permission for one client should not block every other client. A failed TikTok upload should not make the LinkedIn queue ambiguous. That is why the table view matters.

## Old way vs new way

Old way: One spreadsheet for content, one folder for briefs, platform tabs for publishing, Slack for approvals, and a project manager acting as the integration layer.

New way: Every client has a workspace. Every workspace has profiles, sources, keys, connected accounts, schedules, and logs. The agency reviews exceptions instead of manually moving every caption between systems.

## Reality contact

The first version of automation many agencies try is too broad. It promises ten clients, eight networks, replies, images, video, and full autonomy in one launch. The failure is predictable: approval quality drops, the team loses trust, and the system becomes another tab to babysit.

The rollback is to automate one narrow lane: source to draft to approval for two platforms. Once the team trusts the logs, add scheduling. Once scheduling is boring, add more platforms. Once platform publishing is stable, add replies.

## Implementation checklist

- Create one workspace per client.
- Store model keys and provider settings at the workspace level when clients bring their own providers.
- Make untested keys unusable for model selection.
- Keep approval status visible in table form.
- Use per-client schedules instead of one global calendar.
- Log every failed publish with the platform response.
- Give account managers edit rights without giving every person integration admin rights.

## Quantified example

An agency with 10 clients, 3 posts per week, and 3 platforms is managing 90 platform-specific outputs each week. If each output takes 8 minutes to adapt, that is 12 hours of formatting before strategy, review, or reporting. Cutting adaptation time in half gives the team 6 hours back without reducing client oversight.

## Primary action

Pick one repeatable client workflow and turn it into a table: client, source, draft status, approval owner, schedule, platform, publish status, and failure reason.

Secondary actions:

- Add source-backed drafting for clients with regular news or product updates.
- Add custom model keys only after key testing and masking are implemented.
- Add reply automation last, because replies carry higher brand and relationship risk.

## FAQ

> What is social media automation for agencies? It is a system for producing, approving, scheduling, and publishing client social content with reusable profiles, connected accounts, and visible operational state.

> Why does it matter? Agencies scale by reducing repeated process work while protecting client judgment.

> How does it work? Each client gets a workspace with profiles, sources, drafts, approvals, schedules, and platform logs.

> What are the risks? Over-automation, weak approval controls, permission failures, stale sources, and unclear accountability.

## Conclusion

The tension is scale versus review. Agencies need more output, but clients pay for judgment. Automation is useful only when it gives the team more room for judgment.

The uncomfortable part: if nobody owns the approval state, the agency is not automated; it is just faster at losing context.`,
  },
  {
    slug: "source-backed-social-agents-guide",
    title: "Source-Backed Social Agents: How to Keep AI Posts Grounded",
    excerpt:
      "A guide to grounding AI social drafts in RSS, URLs, citations, and operator review so automation does not become confident noise.",
    category: "Agent",
    publishedAt: "2026-04-22",
    imageUrl: "/blog/source-backed-social-agents.png",
    imageAlt: "Evidence cards feeding an AI draft review and approval pipeline.",
    isMarkdown: true,
    audiences: ["smmagent"],
    content: `# Source-Backed Social Agents: How to Keep AI Posts Grounded

> Definition: A source-backed social agent is an AI workflow that keeps generated posts tied to verifiable inputs such as RSS items, URLs, notes, product updates, platform docs, or approved campaign material. It should preserve source links, separate evidence from opinion, and require review when the claim, topic, or destination creates risk.

The failure mode of AI social content is not bad grammar. It is unsupported confidence. A fluent draft can make a weak claim look finished. That is why source-backed workflows matter.

SMMAgent is the agent surface for that operating model.

## The misconception

Many teams ask the model for "five posts about our industry." That creates generic posts because the prompt has no evidence. A better workflow starts with a concrete source and asks for an interpretation.

Source first. Model second. Review third.

## Source types that work

- RSS feeds for recurring industry inputs. The [RSS 2.0 specification](https://www.rssboard.org/rss-specification) defines channel and item fields such as title, link, and description.
- Platform docs for implementation claims, such as X [manage posts](https://docs.x.com/x-api/posts/manage-tweets/introduction), LinkedIn [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), YouTube [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), and TikTok [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post).
- Product release notes and internal changelogs for first-hand product claims.
- Manual operator notes for lived experience, failures, rollbacks, and decisions.

## Narrative example

A generic prompt says: "Write a post about AI agents for social media."

A source-backed prompt says: "Use this RSS item, this product release note, and this client objection. Draft a LinkedIn post that explains why approval logs matter more than perfect prompts. Do not claim platform support unless the connected account exists."

The second prompt gives the model less freedom and produces a better draft.

## Old way vs new way

Old way: The model invents a list of trends, the operator edits tone, and nobody knows which claim came from where.

New way: The system stores source cards, drafts from those cards, links output to evidence, and marks unsupported claims for removal or review.

## Reality contact

Source-backed does not mean truth-guaranteed. Sources can be wrong, stale, incomplete, or misread. RSS summaries can omit important context. Platform docs can change. Internal notes can be biased.

The rollback is explicit humility in the workflow: preserve the link, show the excerpt, label the model's interpretation, and require review for factual claims. A source-backed draft should make checking faster, not unnecessary.

## Implementation map

1. Store sources as first-class records, not hidden prompt text.
2. Extract title, URL, publisher, date, summary, and why it matters.
3. Generate posts with source IDs attached.
4. Separate claim, interpretation, and call to action in the draft object.
5. Display evidence beside the draft in review.
6. Block publishing when a draft contains unsupported claims above the workspace risk threshold.
7. Log which source produced which post.

## Primary action

Before adding more models, add source visibility to the review screen. Operators should see the evidence without opening another tab.

Secondary actions:

- Start with RSS and manual URLs.
- Add citation checks for high-risk categories.
- Add autonomous publishing only for low-risk topics with stable source patterns.

## FAQ

> What is a source-backed social agent? It is an AI social workflow that ties drafts to evidence and keeps the source visible through review and publishing.

> Why does it matter? It reduces unsupported claims and makes human review faster.

> How does it work? Sources are stored, summarized, linked to drafts, reviewed beside output, and preserved in logs.

> What are the limits? The source can still be wrong or incomplete. The agent must support checking, not pretend checking is obsolete.

## Related pages

Use [SMMAgent](https://smmagent.app) for agent workflows, [ClawPoster](https://clawposter.app) for the product home, [SMMClaw](https://smmclaw.app) for agency use cases, [social.maxpetrusenko.com](https://social.maxpetrusenko.com) for the app, and [Max Petrusenko Tech](https://www.maxpetrusenko.com/tech) for the portfolio context.

## Conclusion

The original tension is speed versus truth. Source-backed agents do not remove the tension. They make it visible enough to manage.

The uncomfortable part: if the source is invisible, the draft is just a confident rumor with better formatting.`,
  },
  {
    slug: "bring-your-own-model-keys-social-automation-guide",
    title: "Bring-Your-Own Model Keys for Social Automation",
    excerpt:
      "How provider keys, endpoints, tests, and model availability should work when teams select AI models for writing and replies.",
    category: "Settings",
    publishedAt: "2026-04-22",
    imageUrl: "/blog/model-key-management.png",
    imageAlt: "Secure model key settings table with hidden keys and test status icons.",
    isMarkdown: true,
    audiences: ["smmagent"],
    content: `# Bring-Your-Own Model Keys for Social Automation

> Definition: Bring-your-own model keys means each workspace can add provider endpoints and API keys, test them, and unlock only the models that key can actually use. The app should store secrets securely, mask them after save, prevent later extraction, and block model selection when no tested key exists.

Model choice is now part of the workflow. A team may want OpenAI for writing, Anthropic for long-form review, xAI for fast drafts, Google for low-cost variants, or a custom endpoint for an internal model. The hard part is not showing a dropdown. The hard part is making the dropdown honest.

SMMAgent separates app access keys from model provider keys because they solve different problems.

## The misconception

The wrong settings page asks for one global API key and calls it done. That fails for agencies, teams, and operators because keys have different owners, scopes, budgets, rate limits, and model access.

The better settings page is a table:

- Provider
- Endpoint
- Hidden key field
- Test icon
- Error text under the key when testing fails
- Trash icon to remove the key
- Custom provider rows for additional endpoints

## Why test state matters

A model should not be selectable for writing, replies, agents, tools, vision, or images unless the workspace has a tested key that unlocks it. This avoids a common product failure: users configure a workflow, choose a model, schedule a run, and discover the missing key only when the job fails.

OpenAI documents API credentials in its [platform docs](https://platform.openai.com/docs/quickstart). OWASP's [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) is also useful for the general principle that secrets need controlled storage, rotation, and limited exposure.

## Old way vs new way

Old way: One text box. Save. Hope the model works later.

New way: Add provider row, enter endpoint and key, click test, see green or red icon, save only a masked reference, unlock available models, and never display the raw secret again.

## Reality contact

Testing a key is not perfect proof. A provider can accept a lightweight request and still fail later because of rate limits, model-specific permissions, billing status, content policy, regional restrictions, or endpoint incompatibility.

The rollback is to treat the test as a gate, not a guarantee. The app should still log provider errors at runtime and mark a key unhealthy when repeated failures happen.

## Secure behavior checklist

- Keep app API keys separate from model provider keys.
- Store provider keys per workspace.
- Encrypt or otherwise protect secrets at rest according to the deployment environment.
- Show only a masked value after save.
- Never return the full key to the browser after it is stored.
- Require re-entry to rotate a key.
- Test the key with the provider endpoint before unlocking models.
- Remove models from selection when the key is deleted or unhealthy.
- Let custom providers define endpoint, protocol, and model IDs.

## Implementation map

1. Built-in rows: OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, OpenRouter, and any provider the product supports directly.
2. Custom rows: provider name, endpoint, protocol, key, model IDs, and test state.
3. Model registry: maps providers to capabilities such as writing, replies, tools, vision, and image generation.
4. Selection gate: the model picker reads active tested keys, not static provider marketing lists.
5. Audit trail: created, tested, failed, rotated, and deleted events should be visible to admins.

## Primary action

Build the provider key table before building advanced model routing. The table is the trust layer.

Secondary actions:

- Add custom endpoints after built-in provider rows work.
- Add model capability tags after key testing works.
- Add fallback routing only after runtime errors are logged clearly.

## FAQ

> What are bring-your-own model keys? They are user-supplied provider credentials that let a workspace use its own AI provider access inside the app.

> Why does it matter? Teams control spend, model access, provider choice, and client-specific requirements.

> How does it work? The user enters endpoint and key, tests the connection, and the app unlocks only models available through active tested keys.

> What are the risks? Secret exposure, stale keys, false-positive tests, provider outages, model permission gaps, and unclear billing ownership.

## Related pages

Model-key workflows live on [SMMAgent](https://smmagent.app). The product surface is [ClawPoster](https://clawposter.app), agencies can start from [SMMClaw](https://smmclaw.app), the app runs at [social.maxpetrusenko.com](https://social.maxpetrusenko.com), and the project belongs in [Max Petrusenko Tech](https://www.maxpetrusenko.com/tech).

## Conclusion

The tension is flexibility versus safety. Custom keys make the product more powerful, but every provider option becomes a security and reliability promise.

The uncomfortable part: a model picker without tested keys is not choice; it is a future support ticket.`,
  },
];
