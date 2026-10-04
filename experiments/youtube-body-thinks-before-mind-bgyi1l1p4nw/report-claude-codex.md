# Fingerprint eval: youtube-body-thinks-before-mind-bgyi1l1p4nw

Eval-only experiment. No publish path touched; article package on the mini was only read.

- Writer: codex (family openai)
- Author anchor: 64 pre-2023 posts, 36906 words
- Pipeline corpus: 28 articles (target excluded)
- Original: 1551 words, 152 sentences

## Results

| metric | original | claude-sonnet | control-codex |
|---|---|---|---|
| [author_anchor] author distance (composite, lower = closer) | 0.196 | 0.235 | 0.236 |
| [author_anchor] author Burrows Delta | 0.687 | 0.743 | 0.752 |
| [author_anchor] author sentence-length JSD | 0.206 | 0.191 | 0.198 |
| [author_anchor] author paragraph-length JSD | 0.105 | 0.287 | 0.298 |
| [author_anchor] author punctuation JSD | 0.282 | 0.294 | 0.285 |
| [author_anchor] author function-word cosine | 0.193 | 0.170 | 0.164 |
| [stylistic_structural] pipeline outlier z (composite) | 2.13 | 1.64 | 1.85 |
| [stylistic_structural] pipeline outlier percentile | 0.96 | 0.89 | 0.93 |
| [stylistic_structural] repeated n-gram rate (3-5 mean) | 0.0041 | 0.0059 | 0.0231 |
| [stylistic_structural] sentence-length JSD, original vs rewrite | - | 0.203 | 0.256 |
| [stylistic_structural] paragraph-length JSD, original vs rewrite | - | 0.238 | 0.255 |
| [semantic_retention] semantic similarity (whole) | - | 0.989 | 0.989 |
| [semantic_retention] semantic similarity (section min) | - | 0.917 | 0.923 |
| [semantic_retention] claims preserved / changed / missing | - | 154 / 0 / 0 (of 154, unjudged 0) | 153 / 1 / 0 (of 154, unjudged 0) |
| [semantic_retention] structure preserved (headings/images/code/links) | - | True | True |
| judge | - | claude-sonnet | claude-sonnet |

Delta = after minus before; negative means closer to the author. Composite = mean of the four distances (sentence JSD, paragraph JSD, punctuation JSD, function-word cosine).

## Reading (conditional, per transform)

- Under cross-family A->B proposition regeneration (claude-sonnet), the author-anchor composite distance moved 0.196 -> 0.235 (+0.039); whole-document semantic similarity 0.989; claims 154/154 judged entailed by claude-sonnet.
- Under same-family A->A control rewrite (control-codex), the author-anchor composite distance moved 0.196 -> 0.236 (+0.040); whole-document semantic similarity 0.989; claims 153/154 judged entailed by claude-sonnet.
- Relative to the control (control-codex, +0.040), claude-sonnet moved the author-anchor composite by -0.001 beyond what a same-family rewrite moved. One article, one run: indicative only.
- These are measured style signals on one article. They do not establish provenance, attribution, or detector outcomes; the objective is style preservation toward the author corpus plus meaning retention.

## Structural templates found

| [stylistic_structural] template | original | claude-sonnet | control-codex |
|---|---|---|---|
| rule_of_three_lists | 6 | 10 | 14 |

Original `rule_of_three_lists` examples:
- We notice, decide, remember, and explain.
- The cells tracked word meaning, grammatical roles, and the probability of what might come next.
- It is often caught late, spreads fast, and has resisted many of the therapies that changed other cancers.

## Flagged claims

### claude-sonnet (0 flagged)
- none

### control-codex (1 flagged)
- [changed] (The hidden layer keeps winning) Consciousness remains part of the picture and becomes more interesting, as the layer that makes a world reportable after deeper systems have already acted. -- Drops 'becomes more interesting'; says only that consciousness remains part of picture.

## Lanes

- extraction: claude:sonnet, 154 propositions in 19 segments
- rewrite:claude:sonnet: ok
- rewrite:codex (control): ok

- watermark_tests [signal_family watermark, research tier, not run]: {'signal_family': 'watermark', 'research_only': True, 'run': False, 'reason': 'no vendor keys; GPT/Claude text watermark not verifiable'}
- provenance [signal_family provenance]: n/a for text
- tiers: fast (this report) / research (stub, detectors + watermark, not run)

## Blockers

- none

## Most changed paragraphs: claude-sonnet

### A tiny gland can lock a whole life state (similarity 0.01)

```diff
--- original
+++ rewrite
@@ -1,5 +1,5 @@
-Then the scale shrinks again.
-A woman has one child, stops breastfeeding, and enters secondary infertility. Milk production continues. Headaches arrive. Night sweats. Fatigue. The clue is prolactin, the hormone that helps drive lactation. Too much prolactin can suppress ovulation. The source is a pituitary tumor at the base of the brain.
-Remove the tumor, prolactin returns to normal, and pregnancy becomes possible again.
-The case is small only in screen time. It is a perfect control-system story. A tiny gland can set a body-wide reproductive state. A lactation signal becomes a fertility lock. A local mass becomes a life-path problem.
-Bodies have dashboards. We mostly live in the output.
+A woman has one child, stops breastfeeding, and then develops secondary infertility. Her body keeps making milk long after she stopped nursing. She also has headaches, night sweats, and fatigue.
+Prolactin is a hormone that helps drive lactation. Too much of it can suppress ovulation.
+The source here is a pituitary tumor at the base of the brain. Remove it, and prolactin returns to normal levels. Pregnancy becomes possible again.
+The case takes up little screen time, but it shows a control system well. A tiny gland can set a reproductive state that reaches the whole body, and a signal for lactation can act as a lock on fertility.
+A local mass can become a problem that shapes the course of a person's life. Bodies have dashboards, but people mostly experience only the output.
```

### (intro) (similarity 0.02)

```diff
--- original
+++ rewrite
@@ -1 +1 @@
-*A Russian science digest moves from infrasound and anesthesia to cancer and spinal repair, and keeps finding the same pattern: hidden control systems act before consciousness can report them.*
+This Russian-language science digest covers infrasound, anesthesia, cancer, and spinal repair. Across all four, the same pattern keeps turning up. Hidden control systems act first, and consciousness can only report them afterward.
```

### The hidden layer keeps winning (similarity 0.04)

```diff
--- original
+++ rewrite
@@ -1,6 +1,6 @@
-The episode is a digest, so it jumps: haunted lab, infrasound, anesthesia, dreams, pancreatic cancer, tumor ecology, prolactin, spinal repair.
-The through-line is the control layer.
-A vibration changes stress before it becomes sound. A hippocampus parses language before memory receives a scene. A dream spends the night before the morning self can object. A cancer cell changes tissue law. A pituitary signal locks reproduction. A mature neuron carries a brake that a developing neuron does not.
-The self you can narrate is real. It is also late.
-Most of the body is older bureaucracy: sensors, thresholds, switches, chemical memos, emergency policies, developmental locks, local negotiations, dead letters from evolution that still get delivered. Consciousness stays in the picture and becomes more interesting: the layer that makes a world reportable after deeper systems have already moved.
-You are a layered organism, and many of the layers are already thinking before you arrive.
+The episode is a digest that moves across many topics: a haunted lab, infrasound, anesthesia, dreams, pancreatic cancer, tumor ecology, prolactin, and spinal repair. The common thread is a hidden control layer.
+Vibration can alter stress before it is perceived as sound. The hippocampus processes language before memory receives a scene. A dream uses up the night before the waking self can object to it.
+A cancer cell changes the rules governing tissue. A pituitary signal suppresses reproduction. A mature neuron has a brake that a developing neuron lacks.
+The self that a person can narrate is real but arrives late.
+Most of the body runs on older regulatory machinery: sensors, thresholds, switches, chemical signals, emergency policies, developmental locks, local negotiations, and inherited evolutionary leftovers that still operate. Consciousness remains part of the picture, and it becomes more interesting as the layer that makes a world reportable after deeper systems have already acted.
+A person is a layered organism. Many layers are already processing information before the conscious person arrives.
```


## Most changed paragraphs: control-codex

### A tiny gland can lock a whole life state (similarity 0.02)

```diff
--- original
+++ rewrite
@@ -1,5 +1,5 @@
-Then the scale shrinks again.
-A woman has one child, stops breastfeeding, and enters secondary infertility. Milk production continues. Headaches arrive. Night sweats. Fatigue. The clue is prolactin, the hormone that helps drive lactation. Too much prolactin can suppress ovulation. The source is a pituitary tumor at the base of the brain.
-Remove the tumor, prolactin returns to normal, and pregnancy becomes possible again.
-The case is small only in screen time. It is a perfect control-system story. A tiny gland can set a body-wide reproductive state. A lactation signal becomes a fertility lock. A local mass becomes a life-path problem.
-Bodies have dashboards. We mostly live in the output.
+A woman has one child, stops breastfeeding, and then develops secondary infertility. After she stopped breastfeeding, her body kept producing milk.
+She also has headaches, night sweats, and fatigue. Prolactin is a hormone that helps drive lactation.
+Excess prolactin can suppress ovulation. The source of the excess prolactin is a pituitary tumor at the base of the brain.
+When the tumor is removed, prolactin returns to normal levels and pregnancy becomes possible again. The case takes up little screen time, but it illustrates a control system well.
+A tiny gland can set a reproductive state affecting the whole body. A signal for lactation can act as a lock on fertility. A local mass can become a problem that affects the course of a person's life. Bodies have dashboards, but people mostly experience only the output.
```

### A tumor can change the neighborhood rules (similarity 0.10)

```diff
--- original
+++ rewrite
@@ -1,2 +1,2 @@
-The evidence is from fruit flies, so the human translation stays open. The conceptual move is still important. The question shifts from what is wrong inside the malignant cell to how the malignant cell rewrites the rules around it.
-A tumor can behave like bad governance.
+Supporting evidence comes from fruit-fly experiments. Whether the findings apply to humans remains unresolved.
+The conceptual shift matters. The question moves from faults inside the malignant cell to how it changes the rules of its surrounding environment. A tumor can behave like poor governance.
```

### A dream can spend the night on your behalf (similarity 0.12)

```diff
--- original
+++ rewrite
@@ -1,2 +1,2 @@
-Sleep should be the body's repair shift. Some dreams behave like a second job.
-The episode turns to hyperoneirism, also described as epic dreaming: long, vivid, continuous dream experiences that leave people exhausted even when standard sleep measures look ordinary. Patients report nights with plots, missions, conversations, travel, conflict, obligation. They wake as if they have already worked a shift.
+Sleep is expected to be the period in which the body repairs itself. Some dreams function more like a second job than like rest. This episode discusses hyperoneirism, also called epic dreaming. It involves long, vivid, continuous dream experiences. People with hyperoneirism feel exhausted afterward, even when standard sleep measures appear normal.
+Patients report nights of dreams containing plots, missions, conversations, travel, conflict, and obligation. They wake feeling as though they have already worked a shift.
```

