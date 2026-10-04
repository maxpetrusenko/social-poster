# Fingerprint eval: youtube-body-thinks-before-mind-bgyi1l1p4nw

Eval-only experiment. No publish path touched; article package on the mini was only read.

- Writer: codex (family openai)
- Author anchor: 64 pre-2023 posts, 36906 words
- Pipeline corpus: 28 articles (target excluded)
- Original: 1551 words, 152 sentences

## Results

| metric | original | qwen3:8b |
|---|---|---|
| [author_anchor] author distance (composite, lower = closer) | 0.196 | 0.270 |
| [author_anchor] author Burrows Delta | 0.687 | 0.735 |
| [author_anchor] author sentence-length JSD | 0.206 | 0.239 |
| [author_anchor] author paragraph-length JSD | 0.105 | 0.364 |
| [author_anchor] author punctuation JSD | 0.282 | 0.289 |
| [author_anchor] author function-word cosine | 0.193 | 0.187 |
| [stylistic_structural] pipeline outlier z (composite) | 2.13 | 0.31 |
| [stylistic_structural] pipeline outlier percentile | 0.96 | 0.75 |
| [stylistic_structural] repeated n-gram rate (3-5 mean) | 0.0041 | 0.2627 |
| [stylistic_structural] sentence-length JSD, original vs rewrite | - | 0.282 |
| [stylistic_structural] paragraph-length JSD, original vs rewrite | - | 0.408 |
| [semantic_retention] semantic similarity (whole) | - | 0.981 |
| [semantic_retention] semantic similarity (section min) | - | 0.903 |
| [semantic_retention] claims preserved / changed / missing | - | 153 / 1 / 0 (of 154, unjudged 0) |
| [semantic_retention] structure preserved (headings/images/code/links) | - | False |
| judge | - | claude-sonnet |

Delta = after minus before; negative means closer to the author. Composite = mean of the four distances (sentence JSD, paragraph JSD, punctuation JSD, function-word cosine).

## Reading (conditional, per transform)

- Under cross-family A->B proposition regeneration (qwen3:8b), the author-anchor composite distance moved 0.196 -> 0.270 (+0.073); whole-document semantic similarity 0.981; claims 153/154 judged entailed by claude-sonnet.
- These are measured style signals on one article. They do not establish provenance, attribution, or detector outcomes; the objective is style preservation toward the author corpus plus meaning retention.

## Structural templates found

| [stylistic_structural] template | original | qwen3:8b |
|---|---|---|
| rule_of_three_lists | 6 | 14 |

Original `rule_of_three_lists` examples:
- We notice, decide, remember, and explain.
- The cells tracked word meaning, grammatical roles, and the probability of what might come next.
- It is often caught late, spreads fast, and has resisted many of the therapies that changed other cancers.

## Flagged claims

### qwen3:8b (1 flagged)
- [changed] (The hidden layer keeps winning) The recommended article is about how large systems conceal consequences that operate at a human scale. -- Passage says systems mask personal-feeling effects like wealth gaps; original says consequences at human scale.

## Lanes

- extraction: claude:sonnet, 154 propositions in 19 segments
- rewrite:qwen3:8b: ok
- rewrite:gemma4: blocked
- rewrite:claude:sonnet: blocked
- rewrite:codex (control): blocked

- watermark_tests [signal_family watermark, research tier, not run]: {'signal_family': 'watermark', 'research_only': True, 'run': False, 'reason': 'no vendor keys; GPT/Claude text watermark not verifiable'}
- provenance [signal_family provenance]: n/a for text
- tiers: fast (this report) / research (stub, detectors + watermark, not run)

## Blockers

- rewriter gemma4: `HTTP 404: {"error":{"message":"model 'gemma4-32k' not found","type":"not_found_error","param":null,"code":null}}
`. Fix: gateway models: expose it on GET /v1/models; CLI lanes: fix login/availability of claude -p / codex exec
- rewriter claude:sonnet: `HTTP 524: error code: 524
`. Fix: gateway models: expose it on GET /v1/models; CLI lanes: fix login/availability of claude -p / codex exec
- control rewriter codex: `HTTP 524: error code: 524
`. Fix: gateway models: expose it on GET /v1/models; CLI lanes: fix login/availability of claude -p / codex exec

## Most changed paragraphs: qwen3:8b

### A tiny gland can lock a whole life state (similarity 0.01)

```diff
--- original
+++ rewrite
@@ -1,5 +1 @@
-Then the scale shrinks again.
-A woman has one child, stops breastfeeding, and enters secondary infertility. Milk production continues. Headaches arrive. Night sweats. Fatigue. The clue is prolactin, the hormone that helps drive lactation. Too much prolactin can suppress ovulation. The source is a pituitary tumor at the base of the brain.
-Remove the tumor, prolactin returns to normal, and pregnancy becomes possible again.
-The case is small only in screen time. It is a perfect control-system story. A tiny gland can set a body-wide reproductive state. A lactation signal becomes a fertility lock. A local mass becomes a life-path problem.
-Bodies have dashboards. We mostly live in the output.
+A woman has one child, stops breastfeeding, and then develops secondary infertility. After she stopped breastfeeding, her body kept producing milk. She also has headaches, night sweats, and fatigue. Prolactin is a hormone that helps drive lactation. Excess prolactin can suppress ovulation. The source of the excess prolactin is a pituitary tumor at the base of the brain. When the tumor is removed, prolactin returns to normal levels and pregnancy becomes possible again. The case takes up little screen time, but it illustrates a control system well. A tiny gland can set a reproductive state affecting the whole body. A signal for lactation can act as a lock on fertility. A local mass can become a problem that affects the course of a person's life. Bodies have dashboards, but people mostly experience only the output.
```

### (intro) (similarity 0.03)

```diff
--- original
+++ rewrite
@@ -1,4 +1,4 @@
-An engineer can respect fear without accepting the explanation fear hands him. Tandy moved the table, watched the blade's vibration rise and fall, and traced the room's dread to a standing wave of infrasound from ventilation. A pressure too low for ordinary hearing had found the room's geometry. The case became the classic [Tandy and Lawrence "ghost in the machine" account](https://www.richardwiseman.com/resources/ghost-in-machine.pdf).
-A ghost had become a waveform. The next part reached further.
-The body can receive a fact before the mind can name it.
-A newer [double-blind infrasound experiment](https://www.frontiersin.org/journals/behavioral-neuroscience/articles/10.3389/fnbeh.2026.1729876/full) pushed this further. Researchers paired near-18 Hz infrasound with calm music or anxious ambient sound. People guessed whether the hidden low sound was present at chance level. Their saliva gave a cleaner answer. Cortisol rose. Calm music felt gloomier. The room's emotional weather shifted while the listeners stayed consciously deaf to the signal.
+Tandy moved a table and observed the vibration of a blade rise and fall. While staying late, Tandy traced the dread felt in a room to a standing wave of infrasound produced by ventilation. Infrasound is a pressure too low for ordinary hearing. The infrasound interacted with the geometry of the room to produce a standing wave. The case became the classic Tandy and Lawrence "ghost in the machine" account. The Tandy case turned an apparent ghost into a measurable waveform.  
+A newer double-blind experiment on infrasound extended the finding that the body can respond to a signal the mind has not identified. The double-blind infrasound experiment paired infrasound near 18 Hz with either calm music or anxious ambient sound. Participants guessed at chance level whether the hidden low sound was present. Participants' saliva showed a rise in cortisol. Calm music felt gloomier to participants when infrasound was present.  
+Listeners' emotional state shifted while they remained consciously unaware of the infrasound signal. The body reacted to a vibration it could not name. The signal passed through walls, through floors, through air. The mind registered no sound, but the body remembered. The signal passed through walls, through floors, through air. The mind registered no sound, but the body remembered.  
+The signal passed through walls, through floors, through air. The mind registe
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
+The episode is a digest that moves across many topics: a haunted lab, infrasound, anesthesia, dreams, pancreatic cancer, tumor ecology, prolactin, and spinal repair. The common thread across these topics is a hidden control layer. Vibration can alter stress before it is perceived as sound. The hippocampus processes language before memory receives a scene. A dream uses up the night before the waking self can object to it.  
+A cancer cell changes the rules governing tissue. A pituitary signal suppresses reproduction. A mature neuron has a brake that a developing neuron lacks. The self that a person can narrate is real but arrives late. Most of the body runs on older regulatory machinery: sensors, thresholds, switches, chemical signals, emergency policies, developmental locks, local negotiations, and inherited evolutionary leftovers that still operate.  
+Consciousness remains part of the picture and becomes more interesting, as the layer that makes a world reportable after deeper systems have already acted. A person is a layered organism, and many layers are already processing information before the conscious person arrives. The same study then screened for ways to loosen the regrowth-restraining program. Eurons lose much of the ability to grow axons.  
+The hidden layer keeps winning. The self that a person can narrate is real but arrives late. Most of the body runs on older regulatory machinery: sensors, thresholds, switches, chemical signal
```

