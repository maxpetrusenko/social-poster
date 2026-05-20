# Parker Rex thread sketches

Source: https://x.com/ParkerRex/status/2056406205824635166

## Thread questions / constraints extracted

Evidence was captured read-only with `bird --chrome-profile 'Profile 2' thread ... --json` and `bird ... replies ... --json`.

1. Root constraint from @ParkerRex: “Ask Codex to generate balsamiq style mockups ahead of any long-horizon tasks.” He says this saves time by “going through the wireframes, mapping out all the states, all the views, all the affordances and signifiers,” then doing the visual pass, then using those as reference for Exec Plans/Programs.
2. @samuelroy_: “How do you annotate your mockups and feed them back to Codex for quick iteration?” Parker replies: “You iterate the mockup in Codex just send a bulleted list of what to change and do another round of wires.”
3. @quang__design: “Is that created using GPT-image-2?” Parker replies: “Yeah it’s in Codex.”
4. @bargava: uses “a full mock using gpt-image-2” and “for states: i generate mermaid diagrams that map to the mocks.” Parker replies that he is curious but “Seems like a lot.”
5. @ChaosEmergent: “what are Programs?” Parker replies: “parent loop for execplans. lightweight runtime w/ checks/balances/cross repo analysis/dependency graph updates, per execplan tripwire w/ headless codex review and patch.”
6. @FilterTube_in describes a goal to “draw any rough sketch and iterate live with voice and scratch pad within codex.”
7. @balsamiq suggests “create actual wireframes with balsamiq and use the MCP server to connect to Codex.”

## Variants

| Dimension | 001 Balsamiq Flow Board | 002 Annotation Handoff Studio | 003 Program Control Room |
|---|---|---|---|
| Primary question answered | Why rough wires before long-horizon tasks? | How annotate and feed back to Codex? | What are Programs / parent loop? |
| Density | Medium | Medium-high | High |
| Aesthetic | Rough hand-drawn Balsamiq | Clean productized design-tool | Operational planning dashboard |
| State coverage | Visible Mermaid-ish lane | Strong right-panel diagram | Strong coverage/tripwire model |
| Codex handoff | Bulleted brief textarea | Pins + scratchpad → brief | Exec plan + tripwire references |
| Risk | Too rough for stakeholders who expect polish | May look too polished too early | Process-heavy; less like a mockup tool |

## Recommendation

Winner: 002 Annotation Handoff Studio.

It best answers the most actionable thread question: how to annotate mockups and feed them back to Codex. It keeps the mockup inspectable as HTML, ties numbered annotations to a concrete bulleted brief, includes a state diagram, and still stays light-mode and simple enough to use before implementation.

Use 001 if the goal is explicitly to force a rough Balsamiq-style conversation before any visual design. Use 003 if the team is already planning multi-step Programs/Exec Plans and needs a control surface for implementation gates.

## Open locally

- `open sketches/parker-rex-wireframes/001-balsamiq-flow-board/index.html`
- `open sketches/parker-rex-wireframes/002-annotation-handoff-studio/index.html`
- `open sketches/parker-rex-wireframes/003-program-control-room/index.html`
