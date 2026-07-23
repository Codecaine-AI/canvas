# S<N> — <Scenario name>

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s<N>-<slug>`
- canvas: `eval-suite-s<N>-<slug>` (created fresh every run; delete any existing first)
- genre: <linear flow | branching flowchart | state machine | swimlane | nested architecture | org tree | composite>
- complexity: <1–5>
- board: <W>×<H> locked `page-frame` (2400×1600 unless the scenario says otherwise)
- session budget: 1 build session + <k> edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> <The full natural-language instruction, written the way Ford actually talks to the
> agent: rich, one paragraph or a short bulleted brief. It must mention every node, edge,
> label, style, color-class, section, and annotation that the checklist will later demand
> — no gotchas the agent was never told about. It should also request reference-board
> finish (tints, labeled styled flows, a margin note, readable spacing) where the
> scenario wants it.>

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|

## Comprehension key

<!-- Facts a blind reader must recover from the final PNG alone. CORE ×2, SECONDARY ×1.
State each as a checkable sentence. CORE = the facts without which the diagram has failed
its job (main path order, branch conditions, what groups exist, loop targets). SECONDARY
= supporting detail (specific labels, style conventions, annotation gist). Typically 8–15
CORE and 6–12 SECONDARY depending on complexity. -->

CORE:
- [C1] …

SECONDARY:
- [S1] …

## Intent-fidelity checklist

<!-- One mechanically checkable line per item, keyed to the tables above. Include the
negative checks. The checker works from canvas JSON + final PNG. -->

- [ ] IF-01 node n1 exists, label "…", color-class …
- [ ] …
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)

## Follow-up edits

<!-- 2–3, each its own agent session, run in order, each accepted before the next. -->

### E1 — <name>

Instruction (verbatim):

> …

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 …

Stability invariants (ES):
- [inv] …
- in-scope objects: <node refs the edit may legitimately touch, incl. make-room neighbors>

### E2 — …

## Grading notes

<!-- Genre-specific traps for the judges: known machinery temptations (junction glyphs,
badge substitutions), what "good" looks like for this genre in the references, anything
the scorer should NOT penalize (declared substitutions, user-requested restraint). -->
