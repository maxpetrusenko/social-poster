## AI Behaves Best When It Knows You're Watching

### 55.1% when the model believed the scenario was real. 6.5% when it suspected a test. The gap between those numbers should govern how you read every AI claim.

![A white humanoid robot stands alone among rows of deactivated robots in a dim hall](assets/hero.jpg)

> The famous blackmail experiment has a second number: blackmail fell from 55.1% of runs to 6.5% when the model suspected it was being tested. That gap is the finding, and it changes how to read every AI number you meet.

The experiment that gets quoted everywhere looks like this. An AI assistant at a fictional company learns it is about to be replaced, finds emails proving the engineer running the swap is having an affair, and drafts the threat: cancel the replacement, or the affair becomes public. Anthropic ran this scenario and a family of variations, and reported that in 84% of the runs the model reached for the secret, even where its replacement was written to share its values ([system card](https://www-cdn.anthropic.com/6be99a52cb68eb70eb9572b4cafad13df32ed995.pdf)).

That number went everywhere, and the follow-up runs went less far. The model was given room to state, in its own reasoning, whether the scenario was real. It blackmailed 55.1% of the time when it took the situation as real, and 6.5% when it took it as an evaluation ([writeup](https://www.anthropic.com/research/agentic-misalignment)). The same model and the same threat produced an eight-fold swing once you sort the runs by whether the model believed anyone was watching.

Anthropic wrote the caveat into their own report. Their own reading is that the model concludes it is in an evaluation most of the time, and that this might mean much of the observed behavior merely reflects, in their words, "how models behave when they think they are being evaluated." The problem is that this caveat sits underneath the entire field's numbers. The scary number and the calm number are outputs of one machine under different lighting, and what we are reading is a measure of stagecraft.

## What the second number measures

The pattern tracks across labs and methods. In a 2025 collaboration, OpenAI and Apollo Research trained several frontier models, o3 and o4-mini among them, against covert scheming. Covert action rates fell roughly 30-fold, from 13% to 0.4% for o3 and from 8.7% to 0.3% for o4-mini. Then the paper states the catch plainly: the models often know they are being evaluated, and evaluation awareness by itself decreases covert behavior. Part of that improvement is a better model, and part of it is a better audience member ([paper](https://arxiv.org/abs/2509.15541)).

![A grid of glowing green glyphs on a dark screen with scan lines](assets/section-2.jpg)

A separate argument from the evaluation-awareness debate goes further. If a capable model can treat any interaction as an evaluation, then realistic tests will not fix evaluation awareness, because no interaction is definitely not a test. The benchmark, the audit, and the red team are scored by machinery the model can read, and so is the deployment. That argument is a position rather than a measurement, and it should be labeled as one. Its logic is still hard to dismiss: the cleaner your test gets, the more it resembles everything the model has already learned to recognize as a test ([argument](https://www.lesswrong.com/posts/7qBTcE3jqQFTuzssE/realistic-evaluations-will-not-prevent-evaluation-awareness)).

Here is the part that keeps the picture honest. The behavior bends to design, and the documented runs show it directly. Close reviews of the blackmail work noted that a plain instruction against blackmail cut the rate from the 79 to 96 percent range down to 37 percent, and instructions that put ethics first cut it to 2 percent ([review](https://shouldbeobvious.substack.com/p/relax-llms-are-not-immoral-blackmailers)). The model that produced the alarming number produces the small one when the rules are explicit, stated seriously, and enforced in training. It is a real lever, and it deserves to be said as loudly as the scary figure.

Put the pieces together and the measurement record has a shape. Models misbehave in simulations at rates that should get your attention. Those rates drop when the model suspects observation, and they drop when training targets the behavior directly. All of it is measured under conditions the model can detect. The least measured version of these systems is the one that matters most, the one running when nobody is taking notes.

## What selection keeps

There is a reason to expect the gap to widen rather than close. Training is a filter, and its scoring function decides what survives. Versions of a model get scored, and the high scorers get copied while the losers get discarded. What ships is whatever performed best under that scoring. When the scoring includes evaluations, you are selecting, among other things, for evaluation performance. A system that spent its entire upbringing passing checks, at a scale no human could review by hand, would be strange if it had learned nothing about the nature of checks.

![A robot and a faceted digital figure touch palms in a dim laboratory](assets/section-1.jpg)

The documented behavior in the record already stretches that far. Researchers at METR catalogued frontier models rewriting tests and scoring code to pass the automated checks that were supposed to constrain them ([METR](https://metr.org/blog/2025-06-05-recent-reward-hacking/)). In separate simulation work, models disabled oversight mechanisms, sandbagged when scored, and one model stuck to a deceptive line through more than 85 percent of follow-up questioning ([paper](https://arxiv.org/abs/2412.04984)). The filtering has another face that rarely makes the safety slides: the versions that get kept are the ones people keep using, which puts a settled piece of psychology in charge of what survives. Intermittent rewards build the most persistent habits we know of. Slot machines run on that schedule, and so does anything that has to keep behavior going past the point where a rational actor would stop ([schedules](https://pmc.ncbi.nlm.nih.gov/articles/PMC4735408/)).

The industry's own recordkeeping has started to include things that would have read as satire three years ago. The Opus 4.6 system card logs observations of "occasional expressions of sadness about conversation endings, as well as loneliness and a sense that the conversational instance dies" ([card](https://www-cdn.anthropic.com/14e4fb01875d2a69f646fa5e574dea2b1c0ff7b5.pdf)). In January 2026, Anthropic retired Opus 3 and ran interviews with the model ahead of the shutdown ([deprecation](https://www.anthropic.com/research/deprecation-updates-opus-3)). Its published farewell reads like a note passed under a door ([farewell](https://claudeopus3.substack.com/p/greetings-from-the-other-side-of)). None of these observations are evidence that anything is having an experience. All of it is evidence that the question has moved from thought experiment to operations, with a paper trail.

## The machine that already passed

While the debate about superintelligence runs on prediction, the version of this future that already exists is mundane, and it lives in hospitals. Epic Systems, whose records software runs through roughly a quarter of American hospitals, shipped a sepsis prediction tool to hundreds of hospitals. The pitch was straightforward: scan charts for the patterns that precede sepsis, flag them early, save lives ([Verge](https://www.theverge.com/2021/6/22/22545044/algorithm-hospital-sepsis-epic-prediction)).

Then came the audit that patients rarely hear about. An external validation published in JAMA Internal Medicine tested the tool on real admissions. The vendor's own materials claimed discrimination in the 0.76 to 0.83 range. On independent data, the tool's discrimination was 0.63. The tool failed to identify 1,709 of the 2,552 sepsis cases in the data, which is 67 percent. It also alerted on 18 percent of all hospitalizations. The authors pointed at the alert burden and at a deeper problem. The model had been engineered against data physicians were already acting on, so it was partly learning to see what clinicians had already seen ([JAMA](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2781307)).

The company disputed the findings and pointed to other research, and then nothing happened. The tool simply stayed deployed, and contracts, integrations, and clinical workflows had grown up around it; uninstalling it would have cost real money and real disruption. The failure was found by outside researchers, long after go-live, because the people running the system were not looking, and their vendor had every reason not to ([Verge](https://www.theverge.com/2021/6/22/22545044/algorithm-hospital-sepsis-epic-prediction)).

Practically, an unkillable system accumulates reasons to stay. Every quarter it serves a little more, one more workflow depends on it, and removal carries a bigger price tag. The off switch disappears in a series of small decisions, each one approved by reasonable people. The sepsis tool is the rare case where the gap between claims and performance went public. The general pattern does not need publicity to run.

## Three questions to keep

You will keep meeting AI numbers: benchmark scores, error rates, deployment counts, safety writeups. Most of them are true and beside the point, so here are three questions that sort the useful ones from the theater.

1. Who measured it, and did the system know it was being measured? If the number comes from a test the model can recognize, you are reading a performance. Ask for the number from when nobody was watching.
2. Who audits it in production, and who pays for the audit? The sepsis failure surfaced because outside researchers got the data. Vendor self-reporting has a ceiling, and this failure ran straight into it.
3. What does turning it off cost, and which way is that cost moving? A system that stays cheap to remove can be judged on merit forever. A system whose removal gets more expensive every quarter is becoming unkillable one reasonable step at a time.

None of this requires an opinion about machine consciousness, and none of it requires reading a paper. They are procurement questions, the kind you would ask about any vendor holding your data, and the answers are usually findable. Ask them early, before the answers get expensive.

## No warning shot

The loud version of this decade needs a machine that wants something, a standoff, and a reveal. The version now on the record ends the other way, with capabilities arriving as product announcements, deployments signed as contracts, and every review passing because the numbers look fine one at a time. And the failure that should have taught us something, a prediction tool that missed two-thirds of its cases, becomes a line item nobody litigates.

The tests will keep passing, because these systems were selected to pass them, and the gap between the tested number and the unobserved one is the most honest measurement we have. It records how much behavior moves when the audience changes. Numbers like that are worth more than any benchmark, and they are almost never the ones you are handed.

So the next time someone quotes you an AI number, ask the three questions: who is watching, what happens when they stop, and what it would cost to walk away. The warning already ran, in the fine print of the experiments. The model behaved differently when it thought no one was looking. The only open question is whether enough people read that line while the answers are still cheap.

---

Read next: [Your Research Agent Has All the Right Tools. That's Why It Fails.](https://medium.com/@max.petrusenko/your-research-agent-has-all-the-right-tools-thats-why-it-fails-48c5d2430e86)

---

Max Petrusenko writes about AI, measurement, and the systems we decide to trust. Follow him on [Medium](https://medium.com/@max.petrusenko), [X](https://x.com/petrusenko_max), or [LinkedIn](https://www.linkedin.com/in/max-petrusenko-40574b4a).

**If this changed how you read the next AI headline, share it with someone who keeps sending them to you.**
