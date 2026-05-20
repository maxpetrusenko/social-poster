## Variant: Program Control Room

### Design stance
A systems-level interpretation of Parker’s “Programs” reply: mockups are not just screens, they are control artifacts for long-horizon implementation loops.

### Key choices
- Layout: active programs on the left, runtime lane and reference wire in the center, event log on the right.
- Typography: crisp system sans-serif to feel operational and auditable.
- Color: soft green/cream light palette; no dark mode.
- Interaction: switch programs to update coverage/status, run tripwire review, mark a missing state as resolved.

### Trade-offs
- Strong at: explaining Programs as a parent loop for exec plans with tripwires and dependency checks.
- Weak at: less focused on visual annotation mechanics; it is more process/UI ops than design-tool flow.

### Best for
- Long-horizon tasks in large repos where the mockup needs to stay connected to state coverage, exec plans, and review gates.
