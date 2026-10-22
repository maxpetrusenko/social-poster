# Voice-Breaking Code Audit: X Liked-Post Autopost

## What Breaks the Original's Voice

This document lists code that previously modified, summarized, shortened, or rewrote liked-post sources, breaking their original voice, tone, structure, and personal details.

### Status: **FIXED**

All voice-breaking code has been loosened or removed to preserve the source as closely as possible. Near-verbatim copies are now acceptable—Max pre-vouched by liking.

---

## Previously Breaking Code (Now Fixed)

### 1. Writer Prompt Instructions - Rewriting/Shortening
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `buildXLikedAutopostWriterPrompt`  
**Lines**: ~285-310 (writer rules)

**What it did**:
- "Change roughly 5-15 words" → forced edits even when source was perfect
- "Do not return the source verbatim" → blocked near-copy
- "Max's style: lowercase story-mode, no em dashes in short copy" → forced voice overlay
- Limited examples of when to preserve vs. rewrite

**Fixed**:
- Changed to: "Liked-post reposts should look as close to the original as possible: same length, same structure, same personal details, same story and tone. Near-verbatim is fine."
- Removed rewriting requirements
- Added: "Preserve the source's formatting: line breaks, paragraph structure, capitalization, punctuation (including em dashes, emojis, etc.)"

---

### 2. Character Limits/Truncation
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Constants**: Lines 5-7

**What it did**:
- `X_SAFE_CHAR_LIMIT = 1200` was the default
- `ALLOW_LONG_POSTS` defaulted to `false` (opt-in only)
- Long sources (1500+) were compressed to fit 1200 chars

**Fixed**:
- Changed `ALLOW_LONG_POSTS` to default-enabled: `!== "false"` instead of `=== "true"`
- Long posts now default ON for sources 1500+ chars
- Updated limit to 2500 chars to preserve full personal stories
- Config: `X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS` now defaults enabled

---

### 3. Near-Copy/Similarity Block
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `getXLikedAutopostContentRejection`  
**Lines**: ~445-450 (removed)

**What it did**:
```typescript
if (!input.hasMedia && normalizeComparableText(content) === normalizeComparableText(input.sourceText)) {
  return "writer returned source verbatim";
}
```
- Blocked verbatim copies
- Forced unnecessary rewrites

**Fixed**:
- Removed entirely
- Replaced with comment: "Near-verbatim is acceptable for liked posts - Max pre-vouched"

---

### 4. First-Person Conversion Block
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `getXLikedAutopostContentRejection`  
**Lines**: ~452-455 (removed)

**What it did**:
```typescript
if (hasSourceOwnedFirstPerson(input.sourceText) && hasSourceOwnedFirstPerson(content)) {
  return "writer copied source-owned first person as Max's statement";
}
```
- Converted "I/my/we" to third-person
- Killed personal stories and experiences

**Fixed**:
- Removed entirely
- Writer prompt now allows: "First person ('I', 'my', 'we') is allowed when the source uses it. Max pre-vouched by liking."

---

### 5. Em-Dash/Emoji Stripping
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `getXLikedAutopostContentRejection`  
**Lines**: ~468-471 (removed)

**What it did**:
```typescript
if (content.length < 600 && /\u2014/.test(content)) {
  return "writer used em dash in short copy (Max's voice avoids this)";
}
```
- Stripped em-dashes from short posts
- Forced voice overlay

**Fixed**:
- Removed entirely
- Replaced with comment: "Voice enforcement removed: preserve source formatting including em-dashes"

**Note**: Em-dashes are still caught by `no-ai-slop` `decorative_em_dash` pattern, but only when truly decorative, not when part of source structure.

---

### 6. Reviewer Rules - Rejecting/Shortening
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `buildXLikedAutopostReviewPrompt`  
**Lines**: ~330-370

**What it did**:
- Scored "Hook quality" and "Voice: matches Max's lowercase story-mode style"
- Rejected based on "Max voice" overlay
- No score for preservation or formatting

**Fixed**:
- Changed scoring dimensions to:
  1. **Preservation**: keeps source's length, structure, personal details, tone
  2. **Specificity**: preserves exact numbers, names, mechanisms
  3. **Formatting**: preserves line breaks, capitalization, punctuation, em-dashes, emojis
  4. **Faithfulness**: preserves source frame, story, conclusion
- Reject rule: "It shortens, summarizes, or compresses the source when the source is long enough to preserve"
- Added: "Liked posts should look as close to the original as possible. Near-verbatim is acceptable—Max pre-vouched by liking."

---

### 7. Safety Gates - Dropping Content
**File**: `src/lib/x-liked-autopost-writer.ts`  
**Function**: `getXLikedAutopostContentRejection`  
**Lines**: ~413-418

**What breaks voice**:
- Meta-text detection (SKIP/REVIEW_NEEDED/NOTE) - **KEPT** (prevents meta-output from publishing)
- Too-short draft check (< 20 chars) - **KEPT** (safety minimum)

**What was removed**:
- Verbatim block (removed)
- First-person conversion (removed)
- Em-dash stripping (removed)

**Status**: Safety gates kept minimal - only meta-text and empty-content checks remain.

---

## Config Changes

**File**: `.env.test.example`

**Before**:
```bash
# Enable long posts (up to ~2500 chars)
X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=true
```

**After**:
```bash
# Long posts are ENABLED BY DEFAULT for sources 1500+ chars
# Set to "false" to force short mode (1200 char limit)
# X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=false
```

---

## Summary

**Core principle**: Liked posts should preserve the original's voice, tone, structure, and personal details as closely as possible. Max pre-vouched by liking—the system's job is to pass it through safely, not to rewrite it.

**What remains**:
- Meta-text detection (prevents publishing SKIP/REVIEW_NEEDED/etc.)
- Empty/too-short content checks
- Character budget enforcement (2500 max)
- Thread numbering detection
- Credit footer detection
- No-AI-slop pattern detection (when genuinely sloppy)

**What was removed**:
- Forced rewriting ("do not return verbatim")
- Voice overlay ("Max's lowercase story-mode")
- First-person conversion
- Em-dash stripping
- Near-copy blocking
- Short-mode default (now long-mode default)
- Hook/voice scoring (now preservation/formatting scoring)
