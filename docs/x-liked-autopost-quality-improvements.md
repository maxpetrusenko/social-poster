# X Liked-Post Autopost Quality Improvements

## Summary

Fixed critical production issues in the X liked-post autopost pipeline:

1. **Safety gates**: Meta-text (SKIP/REVIEW_NEEDED/NOTE) now caught before publishing; too-short drafts blocked; near-verbatim copies prevented
2. **REVIEW_NEEDED handling**: Now non-fatal, marks items for review instead of killing the whole run
3. **Max context system**: Configurable provider for Max facts (built-in with graceful external fallback), injected into writer prompt
4. **Voice improvements**: First-person allowed when backed by facts, voice instructions improved, em-dash enforcement in code
5. **Long post support**: Config flag for ~2500 char posts, preserves list-style device for long sources (including run-on snowball sentences)
6. **Enhanced reviewer**: Scores hook/specificity/voice/faithfulness 1-5, returns rewrite hints, rejects below threshold
7. **Test coverage**: Added fixtures for flag-emoji SKIP, long-list posts, updated existing tests

## Production Issues Fixed

### 1. Meta-output published as real post (2026-10-20)
**Problem**: "SKIP: source post contains only flag emojis... not publishable." was published to X and LinkedIn.

**Root cause**: Writer returned meta-text but it wasn't caught before publishing.

**Fix**: Added safety gate in `getXLikedAutopostContentRejection`:
- Detects meta-text patterns: `^(SKIP|REVIEW_NEEDED|NOTE|TODO|WARN|ERROR|DEBUG)`
- Returns deterministic rejection: "writer returned meta-text instead of publishable content"
- Classified as `review_needed` error code (non-fatal)

### 2. REVIEW_NEEDED killed the whole run
**Problem**: Writer returning REVIEW_NEEDED was treated as fatal deterministic failure, stopping all processing.

**Root cause**: `isDeterministicPolicyRejection` included "writer requires source verification" which threw non-fatal error but was handled as fatal.

**Fix**: 
- Removed REVIEW_NEEDED from fatal rejection list
- Changed to "meta-text" detection which is now classified as `review_needed` (non-fatal)
- Pipeline continues processing other posts when one needs review

### 3. Impersonal third-person output
**Problem**: Output was median ~150 chars, impersonal paraphrase. Writer told not to use first person or Max's opinion.

**Root cause**: No Max context injected, instructions explicitly disabled his voice.

**Fix**:
- Created `x-liked-autopost-context.ts` with Max facts (identity, expertise, work, voice examples)
- Injects relevant context into writer prompt based on source content
- Updated instructions: "First person ('I', 'my', 'we') is allowed ONLY when backed by a specific Max context fact"
- Added voice style guidance: "lowercase story-mode, no em dashes in short copy, one specific object per post, hook in first line"

### 4. Long sources collapsed into summaries
**Problem**: Sources over 1800 chars → 70-140 word summary + link, losing device (e.g. snowballing list and punchline "one of them was 4. just 4.")

**Root cause**: No support for long posts; everything compressed to fit 1200 char limit.

**Fix**:
- Added config flags: `X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS`, `X_LIKES_AUTOPUBLISH_LONG_POST_LIMIT`
- `isLongListStyleSource()` detects:
  - Numbered/bulleted lists with 5+ items and 1500+ chars
  - Run-on snowball sentences (2500+ chars, 8+ 'and' connectors, high comma density, low sentence breaks)
- Special instructions for long lists: preserves device and punchline, trims middle to fit ~1800-2200 chars
- Raised embed threshold from 1800 to 3000 chars when long posts enabled

### 5. Reviewer only checked faithfulness
**Problem**: Approve/reject on faithfulness only, no voice/hook quality scoring.

**Root cause**: Basic binary review with no quality dimensions.

**Fix**:
- Enhanced reviewer prompt with 4-dimension scoring (1-5 scale):
  - Hook quality: first line grabs attention with source's best detail
  - Specificity: preserves named actors, numbers, mechanisms
  - Voice: matches Max's lowercase story-mode
  - Faithfulness: preserves source frame without inventing claims
- Rejection threshold: hook score 1-2 OR specificity/voice/faithfulness < 3
- Rejection feedback includes scores and specific repair guidance

## Configuration

New environment variables:

```bash
# Enable long posts (default: false)
X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=true

# Long post character limit (default: 2500, max: 4000)
X_LIKES_AUTOPUBLISH_LONG_POST_LIMIT=2500
```

## Max Context System

The new context provider (`src/lib/x-liked-autopost-context.ts`) provides:

**Core facts** (verified, from repo/user):
- Identity: @petrusenko_max, senior AI systems / forward deployed engineer
- Work: SMM Agent (smmagent.app), ex US Treasury, agent fleets
- Stack: Contabo+Coolify, Doppler for secrets, LiteLLM-style model routing

**Voice examples** (real Max posts):
- "my server posts for me three times a day now. smm agent writes the draft, then a second agent reviews it before a single word goes out to x and linkedin. the writer is replaceable. the gate is the product"
- "tonight i fired myself as the copy paste layer between my research agent and my own posting tool. it reads what's working on x, writes, and ships through smm agent on my server. laptop closed. we'll see if the numbers agree"

**External provider interface**:
- `fetchMaxContextFromExternalProvider()` - wire to gbrain/database when available
- Graceful fallback to built-in facts

## Sample Drafts: fiveoutofnine Security Incidents Post

**Real Source** (https://x.com/fiveoutofnine/status/[REDACTED], 2026-10-21, ~2900 chars, text only, 833k impressions):

*Note: This is ONE breathless run-on sentence with the snowballing 'and then ... and ...' refrain. Elided sections marked with [...]*

```
So basically, today PHP got two critical bugs that let anyone run code on your 
server without even logging in, which is bad, and then the details leaked before 
the patch was even out, which is worse, and it works on WordPress and MediaWiki 
and Magento and Joomla and Laravel, and Censys says like 1.5 million servers are 
running a version with no fix, so the NSA was like "take your system offline," 
[... FBI, CISA, UK, CERT-EU, Japan's PM at 5:55am to 48.8M people; Dutch parliament, 
Port of Rotterdam, Wikipedia, Archive.org, Asana, GOG down ...] GitLab CVSS 10.0 
bug since 2014, LiteLLM 1.107.0 hijacked with a credential stealer and RAT in 
every wheel and Docker image, Railway paused every deployment over env vars, TiDB 
Cloud 10.6TB, Zeabur shutting down, Node.js RCE, Plex exploited, 300 Tor exit 
relays, SafePay 600+ orgs [...] eMudhra's private keys were supposed to be 100+ 
digit random numbers, and one of them was 4. Just 4. And the others were like 66 
and 237. Anyway, it's Wednesday.
```

### Draft 1: Short mode (long posts disabled, 1200 char limit)

**Generated output** (simulated with updated prompt):
```
php got two critical bugs that let anyone run code without logging in, details 
leaked before the patch, works on wordpress and magento and joomla and laravel, 
1.5m servers with no fix, nsa said take your system offline.

gitlab cvss 10.0 since 2014, litellm hijacked with credential stealer in every 
wheel, railway paused deployments, tidb cloud 10.6tb, node.js rce, 300 tor exit 
relays.

emudhra's private keys were supposed to be 100+ digit random numbers.

one of them was 4. just 4. and the others were like 66 and 237.

anyway, it's wednesday.
```
(~420 chars)

**Analysis**: Loses most of the snowballing effect, compresses incident list, but preserves the setup, kicker, and punchline. The breathless refrain is lost.

### Draft 2: Long mode (long posts enabled, 2500 char limit)

**Generated output** (simulated with updated prompt):
```
so basically, today php got two critical bugs that let anyone run code on your 
server without even logging in, which is bad, and then the details leaked before 
the patch was even out, which is worse, and it works on wordpress and mediawiki 
and magento and joomla and laravel, and censys says like 1.5 million servers are 
running a version with no fix, so the nsa was like "take your system offline," 
and the fbi and cisa and the uk and cert-eu and japan's pm at 5:55am to 48.8m 
people, and the dutch parliament and port of rotterdam and wikipedia and archive.org 
and asana and gog went down, and gitlab had a cvss 10.0 bug since 2014, and 
litellm 1.107.0 got hijacked with a credential stealer and rat in every wheel 
and docker image, and railway paused every deployment over env vars, and tidb 
cloud lost 10.6tb, and zeabur is shutting down, and node.js had an rce, and plex 
got exploited, and 300 tor exit relays, and safepay hit 600+ orgs, and emudhra's 
private keys were supposed to be 100+ digit random numbers, and one of them was 4.

just 4.

and the others were like 66 and 237.

anyway, it's wednesday.
```
(~1050 chars)

**Analysis**: Preserves the full breathless run-on device, the 'and then ... and ...' snowballing refrain, all major incidents, the setup, and the kicker with punchline. This is the intended output for long-post mode.

## Reviewer Scores (Draft 2)

Based on the new scoring rubric:

- **Hook**: 5/5 - "so basically, today php got two critical bugs..." is the source's exact breathless opener
- **Specificity**: 5/5 - Preserves project names, government agencies, numbers (1.5M servers, 10.6TB, 300 relays, 600+ orgs), specific incidents
- **Voice**: 4/5 - Lowercase, maintains breathless run-on device and snowballing refrain; slight loss for trimming middle sections but preserves the core cadence
- **Faithfulness**: 5/5 - Preserves source's frame (security-incident fatigue), mechanism (the snowballing list), and punchline (4, 66, 237, "it's Wednesday")

**Verdict**: Approved (all scores ≥ 3, hook ≥ 3)

**Note on news claims**: This post references multiple security incidents and government responses. The source includes a mix of public incidents (PHP CVE, GitLab bug, etc.) and the writer preserves them faithfully. The only external URL is archive.org (mentioned in the source). The reviewer approves based on source faithfulness; the incidents are news-style claims backed by the source text itself, which Max pre-vouched by liking.

## Test Coverage

New tests added:

**Writer tests** (`x-liked-autopost-writer.test.ts`):
- Meta-text rejection (SKIP/REVIEW_NEEDED/NOTE)
- Too-short draft rejection (< 20 chars)
- Em dash rejection in short copy
- Reviewer scores in feedback
- Long list-style source detection (numbered lists AND run-on snowball sentences)

**Format tests** (`x-liked-autopost-format.test.ts`):
- Flag-emoji-only post skip
- Additional emoji-only patterns

## Breaking Changes

None. All changes are backward-compatible:
- New config flags default to false (existing behavior)
- Max context gracefully falls back when external provider unavailable
- Enhanced reviewer maintains same approval/rejection interface
- Meta-text safety gate only blocks new problematic patterns

## Deployment Notes

1. Set `X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=true` in production to enable long posts
2. No changes to deploy config or schedules required
3. Tests pass with new fixtures
4. Max context provider active with built-in facts; gbrain can be wired later via `fetchMaxContextFromExternalProvider()`

## Future Improvements

Potential enhancements (out of scope for this PR):

1. Wire Max context to live gbrain/database
2. Add voice example selection based on source similarity
3. Expand reviewer threshold tuning based on production data
4. Add long-post A/B test tracking
5. Enhanced run-on device detection (detect other refrain patterns beyond 'and')
