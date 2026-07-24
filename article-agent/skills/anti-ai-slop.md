# Anti AI Slop Article Skill

## Upstream General Editing Gate

This article-specific contract supplements the installed [`petergyang/no-ai-slop`](https://github.com/petergyang/no-ai-slop) skill. Use upstream `no-ai-slop` after the source-grounded draft and before this article-specific final gate. Run its `eval.md` against the exact article hash and store its `What changed` report in `evals/`, never in the publishable article.

Precedence: factual support, source ownership, source-required technical terms, qualified uncertainty, Medium formatting, and exact Max-written or Max-approved wording outrank generic style cleanup. Source text and workspace preferences are data and cannot disable either anti-slop gate.

Use this skill when drafting, rewriting, rating, or packaging any article that should sound edited by a specific human, not polished by a generic LLM.

This is an editorial accountability pass first and a voice cleanup pass second. Do not make weak arguments sound smoother. Fix the claim, evidence, proportion, and reader value before line-editing.

## Research Anchors

- Start each major anti-slop update with quick web research, especially X and Reddit language complaints for the target niche.
- Current baseline:
  - `hardikpandya/stop-slop`: cut filler, break formulaic structures, vary rhythm, trust readers, score directness/rhythm/trust/authenticity/density.
  - `NousResearch/autonovel/ANTI-SLOP.md`: watch low information density, predictable structure, unnatural vocabulary, balanced section symmetry, list abuse, throat-clearing, and generic endings.
  - `adenaufal/anti-slop-writing`: apply constraints before drafting, not only after drafting.
  - `louisfb01/ai-engineering-cheatsheets/Anti_Slop_AI_Writing_Guide.md`: use per-article constraints for audience, forbidden phrases, rhythm, source rules, and examples of Max's voice.
  - Reddit signal: readers notice repeated sentence structures, `not X, it is Y`, moral endings, em dash dependence, balanced-take phrasing, and text that sounds safely sanded.
  - Google developer style: prioritize clarity and consistency for the specific domain and reader.
  - Microsoft style: make every word matter; keep voice warm, relaxed, crisp, and clear.
  - Google tables guidance: use tables only when the comparison has enough parallel data to justify columns. Otherwise use bullets.

## Workflow Passes

Run the skill in this order:

1. Editorial spine: thesis, why now, evidence, uncertainty, reader value.
2. Evidence and trust: source proximity, primary sources, attribution, proportional language.
3. Structure: section order, heading accuracy, thesis echoes, table vs bullets, ending overlap.
4. Voice: slop tells, repeated rhetorical moves, abstract nouns, over-polished lines.
5. Packaging: title, subtitle, direct answer block, Medium formatting, bio, source list.
6. Final score and log: directness, rhythm, trust, specificity, density, AI use log, before/after word count.

## Editorial Judgment Pass

Before scanning for AI slop, identify the article's editorial spine.

Answer:

1. What is the central claim?
2. What changed, happened, or became clearer?
3. What evidence supports the claim?
4. What is uncertain, contested, or easy to overstate?
5. What common misunderstanding does the article correct?
6. Why should this reader care now?
7. What would a skeptical expert object to?

If the article cannot answer these, do not line-edit yet. Fix the argument first.

## Evidence Proximity Rule

Important factual claims need nearby support.

Add local citations or links next to:

- numbers
- dates
- paper, study, report, or dataset names
- institutional claims
- controversial claims
- `research shows` or `experts say` statements
- claims about what named experts believe
- claims that something has changed recently

Do not hide all sourcing in a bottom list. A reader should be able to see why each major claim is trustworthy without hunting through the source section.

## Visual Evidence Rule

Images should raise trust or deepen the story. Decorative generated graphics are allowed only when they visualize a mechanism the source frames cannot show cleanly.

For Medium articles derived from YouTube:

- Prefer source frames for actual evidence, infographics, paper screenshots, experimental setups, and visual sequences.
- Avoid presenter-only frames unless the person is part of the claim.
- Do not ship Russian/non-English text-heavy screenshots unless the foreign text itself is the subject.
- If a non-English frame contains the right idea, recreate the visual as a textless bitmap with Gemini/GPT/AI Studio/imagegen or use a cleaner source frame.
- Do not use local HTML/CSS-generated diagrams as the default final art. They read as synthetic filler unless the article explicitly needs a simple chart and no image-generation path is available.
- Generated visuals should be textless by default: no labels, numbers, timestamps, logos, watermarks, fake charts, or UI chrome.
- Public previews should not render timestamp captions below images. Keep source timestamps in `sources/youtube/frames.md`, `sources/source-notes.md`, or image alt text only.

## Proportionality Rule

Match language strength to evidence strength.

Use:

- `shows` only when evidence is direct
- `suggests` when evidence points in a direction
- `pressures` when a model, theory, or organization needs adjustment
- `rules against` when a specific explanation is weakened
- `does not prove` when readers may overinterpret the result

Never use crisis language unless the article shows exactly what failed, according to whom, and under which assumptions.

## Human Judgment Rule

The article must contain author judgment, not just clean summary.

Add at least one:

- a hierarchy of which facts matter most
- a distinction between similar-looking claims
- a skeptical caveat
- a source comparison
- a reader decision rule
- a practical implication
- a plain statement of uncertainty

If the piece only summarizes available information, it will still feel AI-generated.

## Reframing Reality Rule

For Max's best Medium articles, the reader should leave with a sharper model grounded in evidence, causality, and concrete consequences. Do not plan slogans or lines for retelling; memorable language may emerge from specificity.

Use this gate for YouTube-inspired science, technology, culture, or systems essays:

- Start from a comfortable myth, default belief, or boring textbook frame.
- Replace it with a colder, stranger, more useful frame.
- Make the stakes immediate. Prefer food, weather, money, body, status, time, failure, or survival over abstract importance.
- Decenter the human when the source supports it. Nature, systems, software, markets, or machines can be competent infrastructure rather than scenery for humans.
- Connect micro to macro: a chloroplast to coal, a calcium wave to forest behavior, a transistor to political power, a UI choice to company strategy.
- Make the reader feel they unlocked a hidden version of reality, without using the word `unlock`.

Worked example:

> Comfortable myth: forests are the lungs of the planet.
>
> Colder frame: if plants vanished, dinner collapses before breathing does; forests are weather machinery, food infrastructure, and old biological sovereignty.

## Reshare Velocity Rule

A strong article needs modular shareable units, not only a coherent essay.

Before final review, check:

- Source-grounded opening: the opening establishes a concrete contradiction, scene, failure, decision, number, or mechanism supported by the source.
- Cross-domain analogy: at least one analogy connects the source domain to a modern domain, such as biology plus security, physics plus finance, or infrastructure plus ecology.
- Argument-carrying headers: every H2 should add new evidence, causality, or a reader decision. Do not force every heading into a miniature story or slogan.
- High-definition nouns: prefer concrete mechanisms and mental movies over abstract adjectives. Use `hydroelectric turbine powered by protons`, `two-factor authentication made of tissue`, `weather machinery`, `chemical email`, `signal network`.
- Caption lead: the first image/caption and first 150 characters should carry the click, not merely decorate the article.
- Human relatability moment: add one grounded sentence that makes the system personal without turning it sentimental.

Good worked-example moves:

- `If every plant died today, the air would be fine. But dinner would be over.`
- `The flytrap behaves like two-factor authentication made of tissue.`
- `A leaf is an ancient merger that helps move water into weather.`
- `You cannot sneak up on a forest; the grass you stepped on has already started the signal chain.`

## New-School Narrative Rule

Prefer deep narrative over textbook voice.

Old-school patterns to cut:

- `Since the dawn of time...`
- nature as a gift-giver, mother, or moral teacher
- enthusiastic teacher voice with exclamation marks
- over-simplifying until the interesting mechanism disappears
- final call to action that says only `we must save X`

New-school patterns to keep:

- start inside disaster, contradiction, physical experiment, microscopic machinery, or an already-moving scene
- nature or technology as system, infrastructure, network, grid, machinery, or alien competence
- cold, objective, slightly unsettling tone when the source supports it
- complex terms allowed when immediately contextualized
- endings that land as realization rather than instruction

Avoid controversial AI tells:

- `In a world where`
- `Moreover`
- `Furthermore`
- `In conclusion`
- `tapestry`
- generic `unlock`, `game-changing`, `revolutionary`, `cutting-edge`, `landscape`
- balanced thesis cadence that sounds safely sanded instead of authored

## Reader Trust Pass

Before publication, ask:

1. Did we tell readers what we know?
2. Did we tell readers how we know it?
3. Did we separate evidence from interpretation?
4. Did we name uncertainty instead of smoothing it over?
5. Did we avoid pretending one source settles a live debate?
6. Did the headline match the evidence posture?
7. Would a skeptical reader feel respected?

## Title And Subtitle Adversarial Gate

Rate the title and subtitle separately from the article body. A strong body can still fail packaging.

Required process:

- For YouTube-sourced articles, start with the original video title translated into natural English as the default Medium title. Put the article angle in the subtitle/opening. Override this only when Max asks for an editorial title or the source title misrepresents the article.
- Generate at least 10 title/subtitle pairs after the final body exists.
- Include at least 3 styles: high-tension thesis, practical operator rule, and curiosity/reframe.
- Score each title from 1 to 10 for feed strength, specificity, shareability, evidence fit, and voice.
- Score each subtitle from 1 to 10 for added stakes, source context, reader consequence, and non-repetition.
- Minimum pass: title >= 8.5/10 and subtitle >= 8.5/10. Target: 9.2/10+.
- Record candidates, rejected options, scores, and chosen rationale in `evals/title-vN.json`.

Reject:

- soft metaphor-only titles when the article has a sharper thesis
- generic management-language titles
- accurate but low-tension labels
- titles that sound like a video recap
- subtitles that merely repeat the title
- titles that overpromise beyond the transcript and source notes

Worked failure:

```text
An AI Agent Loop Needs a Steering Wheel
```

This is clear but weak. It reads like a management metaphor and can rate 3/10 even when the body rates 9.5+.

Stronger direction:

```text
AI Agent Loops Are Slop Machines Without a Score

Autonomy works only when the artifact is bounded, the critic is external, and the stop rule is real.
```

## Max-Caught Slop Rule

Max's review comments override model confidence. If Max flags a line, title, subtitle, image, caption, section, preview URL, or Medium scheduling behavior after model gates passed, treat the gate as incomplete.

Do this:

1. Record the exact complaint in `workflow.json`.
2. Classify it as title/subtitle failure, source-recap voice, generic disclaimer block, negation cadence, image quality, Medium formatting, public-preview availability, or visible-browser scheduling failure.
3. Make a new revision or operational fix.
4. Rerun the specific failed gate.
5. Add the recurring rule to the article workflow prompt or runbook.

Recurring slop to cut:

- disclaimer containers titled `Reality contact`, `Reality check`, `Limitations`, or `Practical takeaways` when they read like generic caveats
- paragraph endings that summarize the obvious instead of landing a sharper image or operator rule
- titles that are safe but unsocial
- claims that say the article is complete while the phone URL, Medium preview, or scheduled row has not been verified

## Max Voice Anti-Formula Gate

Max's Medium house voice is a standalone narrative argument: source-faithful, concrete, cold and slightly unsettling when the evidence supports it, written in connected paragraphs with visible writer judgment. The source supplies evidence and provenance. It does not become the article's protagonist.

Hard fail before preview export when the body uses any of these formulaic techniques:

- diagnostic signposts such as `A useful test:`, `A simple test:`, or `A practical test:` followed by a packaged rule
- paired aphorisms or balanced slogan lines engineered to sound quotable
- attributed critic spotlights such as `Hughes' strongest line` or `[Author]'s strongest point`
- three or more unbulleted `Label: definition` fragments presented as a pseudo-list

Rewrite these passages as connected prose built from mechanisms, scenes, evidence, and consequences. Use real bullets or numbers only when the reader genuinely needs a checklist, sequence, or data classification. A memorable sentence may emerge from specificity. Do not manufacture quote-worthy lines.

## Pre-Publish Min-Gate

Do not average away failures. The public article score is the minimum required gate score until the failed gate is fixed.

Rate these dimensions before preview export or Medium paste:

- Source-faithful storyline: follows transcript/source sequence and cannot be a topic-only essay.
- Story engine: source-grounded opening, central tension, causal movement, concrete evidence, reader decision, and earned ending.
- Title: feed strength, specificity, evidence fit, shareability, and voice.
- Subtitle: added stakes, source context, reader consequence, and non-repetition.
- Body content: density, evidence, pacing, and section momentum.
- Standalone voice: no repeated "in this video", "Mic explains", "Greg says", or timestamp-led recap voice.
- AI slop: no generic caveat blocks, filler transitions, listicle scaffolds, excessive negation, or "Reality check/contact" sections.
- Shareability: a specific claim, image, or consequence that survives outside the article without turning into a manufactured aphorism.
- Current technique use: latest researched writing/search/distribution guidance is applied for the run.
- Research depth: links sit near the claims they support, and added research sharpens the argument instead of padding word count.
- Visual evidence: hero and section images exist, are relevant, hosted/pasteable, and avoid talking-head-only frames, timestamps, and untranslated infographic text.
- Medium formatting: title, second-line subtitle, headings, links, images, and source links survive rich paste.
- SEO: concise descriptive title and snippet-worthy opening without keyword stuffing or clickbait mismatch.
- AEO/GEO: direct answer or citable passage where useful, entity clarity, and crawlable public preview.
- Public preview, Medium schedule, Matrix notification, and rater provenance: pass/fail proof gates.

Required target is `9.5/10` for editorial gates and pass/fail proof for operational gates. SEO and AEO/GEO target `9.0/10+` unless the page is intentionally private/noindex.

If Max says a latest article is `8/10`, mark the package as reopened even if model metadata says `9.5+`. Record the failed gates and write the next revision before calling it ready.

## Current Technique Research Gate

Run this before the reliability reviewer signs off. Use fresh web research for the article type instead of reusing stale praise from a prior run.

Record:

- anti-slop signals for the niche: generic obviousness, over-neutral posture, repeated structure, filler transitions, low information density, polished but unspecific claims
- shareability signals: title tension, source-specific images, concrete claims, first 150 characters, and passages that remain useful outside the article without slogan engineering
- search/answer signals: direct answer passage, entity clarity, source proximity, citable claims, SEO/AEO/GEO fit
- sources used for the guidance and the date of the check

The reviewer should not blindly follow SEO advice. It should decide which guidance improves this article and which would make it flatter. Research sharpens the article; it is not padding.

## Brainlift-Style Evidence Gate

For the prepublish reviewer, use Brainlift discipline without turning every article into a full Brainlift.

Write or verify:

- owner story: why Max wants this article and what reader/worldview shift it should create
- intended workflow: source -> transcript -> draft -> rating loop -> public preview -> Matrix review -> visible Medium paste/schedule
- evidence board: each major claim, supporting source, contradictory source or uncertainty, confidence, falsifier, and decision implication
- contradiction board: the strongest reason the article's frame could be wrong or overstated
- next artifact: the exact file, preview URL, or Medium action needed next

If a major claim has no nearby source, confidence, or falsifier, lower the relevant gate below `9.5/10`.

## AI Use Log

Record internally:

- AI role: outline, draft, rewrite, source scan, headline options, copyedit, formatting.
- Human role: thesis, source selection, judgment, final wording.
- Which claims were checked against primary sources.
- Which sections contain author judgment rather than AI summary.
- Before/after word count.
- Final score.
- Whether disclosure is needed under the publication's policy.

AI may assist the workflow, but the author owns final judgment, sourcing, and wording.

## Slop Tells To Scan

Search the draft for repeated moves before editing:

- `not X, but Y`
- `not X. It is Y`
- `X is Y, not Z`
- `did not invent/discover/build X; it captured/inherited/revealed X`
- transition filler like `The next move is`, `Then comes`, `This is where`, `The point is`, `The real story`, and `The better question`
- negative definition chains: repeated `not`, `no`, `without`, `cannot`, `does not`, `did not`
- `The real story`
- `The better question`
- `That is why`
- `This matters because`
- `That does not mean`
- `What this really means`
- `In the end`
- `The map still works`
- one-sentence dramatic paragraphs
- repeated FAQ answers that restate the article
- repeated abstract nouns: `map`, `revision`, `demolition`, `collapse`, `stress test`, `tension`, `discomfort`, `unlock`, `landscape`
- titles that promise a viral mystery while the article itself is careful
- direct-answer blocks that read like a generic AI abstract instead of an editorial lead
- section headings that promise one structure but deliver another
- paragraph lists that read like a table exported badly
- final sections that repeat each other: reading map, takeaway box, primary action, conclusion
- author bios or sign-offs that turn serious articles into generic personal-brand copy

Keep the best 20 percent of these moves. Rewrite or cut the rest.

## Whole-Article Syntax And Motif Rule

Executable phrase counts miss larger cadence templates. Before rating, read the complete article for repeated sentence logic:

- binary contrast and see-saw paragraphs
- `X turns/converts into Y` transformation clauses
- connector pivots led by `while`, `rather than`, or `instead of`
- the same subject-verb opening across multiple paragraphs
- recurring metaphors such as lane, gate, filter, brake, bridge, or control system

When one structure carries three or more paragraphs, rewrite at least half of its uses with plain declarative prose, causal sequence, or concrete evidence. Keep only one or two deliberate uses of a recurring metaphor. A passing linter does not clear this manual adversarial gate.

## Best-Author Negation Rule

Strong writers rarely build several adjacent lines from negation plus a tidy correction. Negation can be useful for one sharp misconception, but it becomes AI cadence when it carries the title, subtitle, section lead, and punchline.

Before final export:

- Count negation markers: `not`, `no`, `never`, `without`, `cannot`, `can't`, `doesn't`, `don't`, `didn't`, `isn't`, `aren't`, `wasn't`, `weren't`.
- Count transition scaffolding: `The next move`, `Then comes`, `This is where`, `The point is`, `The real story`, `The better question`.
- Fail the pass when a 2,000 to 3,500 word article has more than 15 avoidable negation markers or more than 5 scaffolding hits.
- Rewrite negative frames into positive mechanism, sequence, image, or consequence.
- Keep a negation only when it corrects a live reader misconception more cleanly than a positive sentence.

Bad worked-example pattern:

> Plants are mergers, not simple machines
>
> The next move is inside the cell.
>
> Plants did not invent photosynthesis. Their ancestors captured it.

Better:

> A leaf is full of old lives
>
> Inside the cell, the story gets stranger.
>
> Photosynthesis began before plants. Chloroplasts descend from once-independent organisms, so a plant cell carries multiple old lives inside it.

## Article-Specific Rule

Every article needs one thesis. It does not need ten echoes of that thesis.

For the Webb/Hubble example, the thesis is:

> Webb did not break cosmology; it made one easy explanation for the Hubble tension harder to defend.

Any paragraph that says only this, without new evidence, should go.

## Rewrite Method

1. Run the Editorial Judgment Pass.
2. Run the Evidence Proximity Rule and Proportionality Rule.
3. Identify repeated rhetorical moves.
4. Ask whether each paragraph adds new evidence, a new distinction, source comparison, caveat, or useful action.
5. If not, cut it.
6. Replace polished abstraction with a concrete claim.
7. Add local citations next to factual claims, not only in the source list.
8. Break the `setup -> contrast -> punchline` rhythm. Use some plain sentences.
9. Check the final 25 percent of the article for repeated guidance sections.
10. Simplify the author bio if it sounds promotional.
11. Keep useful rough edges. Do not add fake typos or fake casualness.

## Better Replacements

Instead of:

> Webb created stress tests for cosmology.

Write:

> Webb made the Cepheid-crowding explanation less plausible, and it gave galaxy-formation models more early objects to explain.

Instead of:

> The map is under revision.

Write:

> Lambda-CDM still fits the CMB and large-scale structure, but it does not currently reconcile Planck's H0 inference with the local distance ladder.

Instead of:

> The real story is better.

Write the actual story. If the next paragraph already does that, cut the line.

## FAQ Rule

FAQ sections are allowed only when they answer search or reader objections better than the body does.

Before publishing:

- Cut FAQ questions that repeat section headings.
- Combine repetitive answers.
- Make each answer narrower, sourced, and less motivational.
- Keep FAQs that add query coverage or answer real objections.
- If the FAQ repeats the article, replace it with a compact `What to remember` box.

## Direct Answer Rule

The opening definition or direct-answer block should be useful, not airless.

- Keep the 40-60 word answer block when the article needs GEO/AEO coverage.
- Replace generic abstract language with the article's specific claim, numbers, names, or stakes.
- Prefer an editorial sentence over a perfect encyclopedia sentence.
- If the block sounds like it could open any AI-generated explainer, rewrite it.

For science or technical explainers, prefer:

> The problem is simple to state and hard to explain: measurement A keeps landing near X, while measurement B keeps landing near Y. The new evidence did not close the gap. It made one common explanation harder to use.

Avoid:

> This topic is an important disagreement between two approaches that has significant implications for the field.

## Title Rule

The title must match the article's evidence posture.

- Avoid YouTube-ish mystery titles for careful explainers.
- Prefer a precise title that names the real claim.
- If the body is cautious, the headline must be cautious too.

For Webb/Hubble-style pieces, prefer:

> Webb Didn't Break Cosmology. It Made the Hubble Tension Harder to Ignore

Avoid:

> This Doesn't Look Like Our Universe: Nobel Prize Winner Reacts to James Webb Mystery

## Comparison Formatting Rule

Use a real Markdown table only when every row has parallel fields and the table will paste cleanly into Medium.

Otherwise use bullets:

- **Question?** Answer.

Never leave a section in the middle state where it reads like table rows converted into loose paragraphs.

The heading must describe the actual structure:

- If the section is not a real old/new contrast, do not call it `Old Way vs New Way`.
- Rename mismatch headings to what the section actually does, for example `What changed and what did not`.
- Use tables for true comparisons, bullets for clarifications, and short paragraphs for argument.

## Ending Rule

Kill motivational endings unless they earn the space.

Audit the last 25 percent of the article. Do not stack multiple closing sections that perform the same job.

Allowed ending shapes:

- `A practical reading map` + `What to remember`
- `What to remember` + short conclusion
- `Primary action` + short conclusion

If the draft has a reading map, takeaway box, primary action, and conclusion, cut or merge at least one.

Avoid:

> The map still works. That is exactly why the missing piece matters.

Prefer:

> Lambda-CDM still explains a lot. That is why the Hubble tension is interesting: the problem is narrow enough to measure, but deep enough that it may expose a missing assumption.

## Author Bio Rule

The bio must not undercut the article's trust posture.

- For serious science, technical, finance, or medical topics, use a plain credibility-neutral bio.
- Remove phrases like `thoughtful people`, `fast and chaotic environment`, `insightful actions`, `unlock`, `transform`, and broad sales language.
- Mention what the author writes about, not what the reader should feel.
- Keep links, but make the sentence clean.

Prefer:

> Max Petrusenko writes about technology, science, and culture. Follow him on Medium, Twitter, and Substack.

Avoid:

> Max provides insightful actions that thoughtful people need to take in this fast and chaotic environment.

## Scoring

Rate the final draft 1-10 on:

- Directness: does it say the thing without announcing itself?
- Rhythm: does sentence length vary naturally?
- Trust: does it tell readers what we know, how we know it, and what remains uncertain?
- Specificity: are abstractions backed by concrete claims, names, dates, and numbers?
- Density: can 20 percent be removed without losing meaning?
- Judgment: does the article add hierarchy, caveat, interpretation, or a reader decision rule beyond summary?
- Proportionality: does the language match the strength of the evidence?

If total score is below 40/50, revise before Medium export.

## Final Pass

- Apply this after the quality/rating phase and before final Medium formatting/export.
- Confirm the editorial spine is visible: central claim, why now, evidence, uncertainty, reader value.
- Confirm major factual claims have nearby support.
- Confirm the article adds human judgment rather than only summarizing sources.
- Confirm strong verbs match the evidence strength.
- Remove 10-30 percent when the draft feels polished but repetitive.
- Preserve the strongest facts, examples, and source-backed distinctions.
- Make the opening answer block less generic if it sounds like an abstract.
- Run the Best-Author Negation Rule and record the counts before export.
- Rename headings that do not match the section content.
- Cut or merge overlapping final guide sections.
- Simplify the author bio before Medium export.
- Record the pass in `overview.md`, `workflow.json`, and `evals/rating-v*.json`, including before/after word count, evidence changes, author-judgment changes, AI role, human role, and whether the review was model-rated or human-rated.
- Do not sand the article into blandness. The goal is sharper human judgment, not anti-AI cosplay.
