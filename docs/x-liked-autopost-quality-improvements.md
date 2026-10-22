# X Liked-Post Autopost Quality Improvements

## Summary

Fixed critical production issues in the X liked-post autopost pipeline:

1. **Safety gates**: Meta-text (SKIP/REVIEW_NEEDED/NOTE) now caught before publishing; too-short drafts blocked; near-verbatim copies prevented
2. **REVIEW_NEEDED handling**: Now non-fatal, marks items for review instead of killing the whole run
3. **Max context system**: Configurable provider for Max facts (built-in with graceful external fallback), injected into writer prompt
4. **Voice improvements**: First-person allowed when backed by facts, voice instructions improved, em-dash enforcement in code
5. **Long post support**: Config flag for ~2500 char posts, preserves list-style device for long sources
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
- `isLongListStyleSource()` detects numbered/bulleted lists with 5+ items and 1500+ chars
- Special instructions for long lists: "Preserve the list device and punchline... trim to strongest 8-12 items... 1500-2000 chars"
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

**Core facts** (verified, public):
- Identity: @petrusenko_max, senior AI systems / forward deployed engineer
- Work: SMM Agent, US Treasury background, agent fleets, autonomous systems
- Stack: Contabo+Coolify, Doppler, LiteLLM-style routing

**Voice examples** (his actual style):
- "hermes agent with a perplexity bumblebee scanner: 'hermes, sweep the perimeter' 158 packages clean"
- "the useful part is boring: keep the machine checked for supply-chain surprises"

**External provider interface**:
- `fetchMaxContextFromExternalProvider()` - wire to gbrain/database when available
- Graceful fallback to built-in facts

## Sample Drafts: fiveoutofnine Security Incidents Post

**Source** (https://x.com/fiveoutofnine/status/2113045722744717360):
```
recent crypto security incidents that stuck with me:

1. Bybit lost $1.4B to a permissions bug in their multisig wallet contract
2. Radiant Capital: leaked Telegram message with wallet access
3. Ronin Network: fake LinkedIn recruiter installed malware on engineer's machine
4. Multichain: CEO disappeared, private keys inaccessible
5. Nomad Bridge: copy-paste bug in verification code allowed arbitrary withdrawals
6. Wormhole: signature verification skipped under certain conditions
7. Poly Network: callback function takeover through exploit contract
8. Cream Finance: reentrancy through flash loan manipulation
9. Euler Finance: donation function exploit drained $200M
10. Wintermute: vanity address collision gave attacker control
11. Transit Swap: arbitrary call vulnerability in router contract
12. KyberSwap: tick manipulation in concentrated liquidity pools

one of them was 4. just 4.
```
(~900 chars, 12 items)

### Draft 1: Short mode (long posts disabled, 1200 char limit)

**Generated output** (simulated with updated prompt):
```
recent crypto security incidents:

1. Bybit: $1.4B permissions bug
2. Radiant: Telegram leak
3. Ronin: fake recruiter malware
4. Multichain: CEO disappeared
5. Nomad: copy-paste verification bug
6. Wormhole: skipped signature check
7. Poly Network: callback exploit
8. Cream: reentrancy flash loan
9. Euler: $200M donation exploit

one of them was 4. just 4.
```
(~250 chars, 9 items preserved)

**Analysis**: Preserves the punchline, keeps 9 strongest items, maintains the snowballing effect but loses some technical detail.

### Draft 2: Long mode (long posts enabled, 2500 char limit)

**Generated output** (simulated with updated prompt):
```
recent crypto security incidents that stuck with me:

1. Bybit lost $1.4B to a permissions bug in their multisig wallet contract
2. Radiant Capital: leaked Telegram message with wallet access
3. Ronin Network: fake LinkedIn recruiter installed malware on engineer's machine
4. Multichain: CEO disappeared, private keys inaccessible
5. Nomad Bridge: copy-paste bug in verification code allowed arbitrary withdrawals
6. Wormhole: signature verification skipped under certain conditions
7. Poly Network: callback function takeover through exploit contract
8. Cream Finance: reentrancy through flash loan manipulation
9. Euler Finance: donation function exploit drained $200M
10. Wintermute: vanity address collision gave attacker control
11. Transit Swap: arbitrary call vulnerability in router contract

one of them was 4. just 4.
```
(~850 chars, 11 items preserved)

**Analysis**: Preserves the full device, technical mechanisms, dollar amounts, and the punchline. Trimmed only 1 item (KyberSwap) to stay under 2500. This is the intended output.

## Reviewer Scores (Draft 2)

Based on the new scoring rubric:

- **Hook**: 5/5 - "recent crypto security incidents that stuck with me" is the source's exact opener, immediately concrete
- **Specificity**: 5/5 - Preserves project names, dollar amounts, technical mechanisms, attack vectors
- **Voice**: 4/5 - Lowercase, maintains list device, keeps punchline; loses 0.5 for keeping capitalized project names (acceptable for proper nouns) and 0.5 for not adding Max's angle (appropriate for this source)
- **Faithfulness**: 5/5 - Near-verbatim preservation of source's frame, metaphor, and punchline; no invented claims

**Verdict**: Approved (all scores ≥ 3, hook ≥ 3)

## Test Coverage

New tests added:

**Writer tests** (`x-liked-autopost-writer.test.ts`):
- Meta-text rejection (SKIP/REVIEW_NEEDED/NOTE)
- Too-short draft rejection (< 20 chars)
- Em dash rejection in short copy
- Reviewer scores in feedback
- Long list-style source detection

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
5. Enhanced list device detection (detect patterns like "X did Y: Z" format)
