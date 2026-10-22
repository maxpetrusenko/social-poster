# X Liked-Post Autopost: Voice Preservation Update

## Summary

Per Max's direction, the X liked-post autopost pipeline now preserves the original post's voice, tone, structure, length, and personal details as closely as possible. Near-verbatim copies are acceptable—Max pre-vouched by liking the source.

## Key Changes

### 1. Writer Prompt (src/lib/x-liked-autopost-writer.ts)

**Before:**
- "Do not return the source verbatim"
- "Change roughly 5-15 words"
- Forced "Max's voice: lowercase story-mode, no em dashes"
- Required rewriting

**After:**
- "Liked-post reposts should look as close to the original as possible"
- "same length, same structure, same personal details, same story and tone"
- "Near-verbatim is fine"
- "Preserve the source's formatting: line breaks, paragraph structure, capitalization, punctuation (including em dashes, emojis, etc.)"

### 2. Removed Voice-Breaking Checks

**Removed:**
- Verbatim copy blocking (line ~445)
- First-person conversion check (line ~452)
- Em-dash stripping for short posts (line ~468)
- Helper functions: `normalizeComparableText`, `hasSourceOwnedFirstPerson`

**Kept:**
- Meta-text detection (SKIP/REVIEW_NEEDED/NOTE) - prevents publishing meta-output
- Too-short draft check (< 20 chars)
- Character budget (2500 max for long posts)
- Thread numbering detection
- Credit footer detection

### 3. Reviewer Scoring Changes

**Old Dimensions:**
- Hook quality (1-5)
- Specificity (1-5)
- Voice (matching "Max's lowercase story-mode")
- Faithfulness (1-5)

**New Dimensions:**
- **Preservation** (1-5): keeps source's length, structure, personal details, tone
- **Specificity** (1-5): preserves exact numbers, names, mechanisms
- **Formatting** (1-5): preserves line breaks, capitalization, punctuation, em-dashes, emojis
- **Faithfulness** (1-5): preserves source frame, story, conclusion

**New Reject Rule:**
- "It shortens, summarizes, or compresses the source when the source is long enough to preserve"

### 4. Long Posts Default-Enabled

**Before:**
- `X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=true` required
- Default: 1200 char limit
- Long posts were opt-in

**After:**
- `X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS !== "false"` (default enabled)
- Default: 2500 char limit
- Long posts are default for sources 1500+ chars

### 5. First-Person Handling

**Before:**
- Converted "I/my/we" to third-person
- Blocked source-owned first-person as "Max's statement"

**After:**
- "First person ('I', 'my', 'we') is allowed when the source uses it. Max pre-vouched by liking."
- No conversion to third-person

## Configuration

```bash
# .env
# Long posts are ENABLED BY DEFAULT for sources 1500+ chars
# Set to "false" to force short mode (1200 char limit)
# X_LIKES_AUTOPUBLISH_ALLOW_LONG_POSTS=false
```

## Voice-Breaking Audit

See `docs/voice-preservation-audit.md` for the complete audit of code sections that previously broke the original's voice, with exact file/function/line references and descriptions.

## Testing Status

**Files Modified:**
- `src/lib/x-liked-autopost-writer.ts` - Core writer/reviewer logic
- `src/lib/x-liked-autopost-config.ts` - Long post defaults
- `src/lib/x-posting-skill.ts` - Restored flexibility note
- `.env.test.example` - Updated config documentation
- `docs/voice-preservation-audit.md` - New audit document
- `docs/x-liked-autopost-quality-improvements.md` - This file

**Safety Gates Retained:**
- ✅ Meta-text detection (SKIP/REVIEW_NEEDED/NOTE)
- ✅ Empty content check
- ✅ Too-short draft check (< 20 chars)
- ✅ Character budget enforcement (2500 max)
- ✅ Thread numbering detection
- ✅ Credit footer detection
- ✅ No-AI-slop pattern detection

**Core Principle:**
Max pre-vouched by liking. The system's job is to pass the content through safely, not to rewrite it.

## Example: fiveoutofnine Post

The real `fiveoutofnine` "Anyway, it's Wednesday" post (~2600 chars, one breathless run-on sentence with 20+ "and" conjunctions) now passes through with minimal edits, preserving:
- Run-on sentence structure
- Breathless pacing and "and then... and..." refrain
- All specific numbers (1.5 million servers, 48.8M alerts, 300 Tor relays, private key = 4)
- Personal voice and kicker ending
- Full length (not compressed to 1200 chars)

## Next Steps

1. Update unit tests to match new voice-preservation direction
2. Run full test suite (`npm run test:unit`, `npm run typecheck`, `npm run lint`)
3. Mark PR ready for review
