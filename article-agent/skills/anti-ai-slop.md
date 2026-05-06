# Anti AI Slop Article Skill

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

## Reader Trust Pass

Before publication, ask:

1. Did we tell readers what we know?
2. Did we tell readers how we know it?
3. Did we separate evidence from interpretation?
4. Did we name uncertainty instead of smoothing it over?
5. Did we avoid pretending one source settles a live debate?
6. Did the headline match the evidence posture?
7. Would a skeptical reader feel respected?

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
- Rename headings that do not match the section content.
- Cut or merge overlapping final guide sections.
- Simplify the author bio before Medium export.
- Record the pass in `overview.md`, `workflow.json`, and `evals/rating-v*.json`, including before/after word count, evidence changes, author-judgment changes, AI role, human role, and whether the review was model-rated or human-rated.
- Do not sand the article into blandness. The goal is sharper human judgment, not anti-AI cosplay.
