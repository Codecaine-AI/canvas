# Process proposal — where rules should end and looking should begin

Synthesis of the 2026-07-22 rule eval (33 sessions, five diagram types; evidence in `scorecard.md`
and the five `findings-*.md` files).

## 1. Verdict on the hypothesis

The hypothesis — snapshot → compress → propose structure through rules → **then fine-tune by looking,
with fewer constraints** — is supported, with one important correction.

**Supported:** the structural rules genuinely deliver. Blind first solves of 14–17-object diagrams came
out structurally publishable (even pitch, flat registers, centered hubs, clean multi-hop detours) on every
type. R5 align went 6-for-6 with zero blocks. Nothing in the evidence says "fewer rules for structure."
And the process half is confirmed as strongly as an n=33 eval can: every session that rendered twice and
adjusted in between produced the best or only-accepted result of its type; single-render sessions
repeatedly committed defects visible in the render they had just looked at.

**Correction:** what blocks intent is mostly not the aesthetic rules — it is the *language and the
round-trip machinery*. The three runaway blockers (DSL expressiveness 21×, R10 no-fine-offsets 10×,
size-normalization drift 7×) are all mechanism-layer. A "fewer constraints" fine-tune mode aimed at
relaxing R1–R9 would miss the target: the agent almost never wanted to break the ladder or the registers;
it wanted to say things the language has no words for (edge labels, edge styles, a display label, a 20px
offset, "keep everything else where it is") and to make an edit whose round-trip doesn't mutate
unrelated geometry. Rules should keep owning *structure*; the fine-tune phase needs *vocabulary and
stability*, not deregulation.

So the division of labor is:

1. **Structure by rules** (unchanged): fit_scope → whole-program rewrite → solver owns pixels.
2. **Then a surgical mode** after the first good render: pin-and-adjust operations that do NOT re-solve
   the scope, expressed in the same program (see §3.2). The ladder/grid stay the default; surgical moves
   are linted (advisory) rather than refused.
3. **Render is the loop, not the checkpoint:** render after the first successful solve, adjust, render
   again; commit only when the last render was clean or the remaining flaws are named in the commit summary.

## 2. Target process (v2 working loop)

```
fit_scope
  → propose_program (structure pass; rules + solver as today)
  → render_draft                      ← moved UP: look at the FIRST solved draft, always
  → judge against the instruction AND the baseline (for "tighten/align/fix"-class asks)
  → EITHER re-propose structure (big misses)
    OR surgical ops (small misses: nudge/pin/edge attrs)   ← new
  → render_draft again
  → commit (summary must name any known remaining flaw)
    or abandon-with-counter-offer (see §3.3)
```

Two loop rules the eval justifies directly:

- **No commit on a defect you saw.** Swimlane S1 ("giant paths" in its own thinking), state-machine S1b
  ("Planning label box size reduction"), org-tree S7 (clipped node in the render) all committed anyway.
  The prompt must make "render shows a flaw → adjust or name it in the summary" an explicit obligation.
- **No abandon without a render or a counter-offer.** Swimlane S2 abandoned three *solved* drafts
  sight-unseen; nested-arch S5 abandoned all-or-nothing when half the request (`size=L`) was expressible.

## 3. Change list

### 3.1 Prompt/doc-only changes (cheap — hours, no solver code)

**(a) Grammar reference in the system prompt.** ~140 failed propose_program calls, concentrated at
11–23 consecutive rejections per *first* session, because the grammar is only learnable from fit_scope
echoes of structures that already exist. A ~30-line cheatsheet (statement forms, `|`-weights, `at=`
compass slots, closed gap rungs 0/32/64/96, size classes S/M/L, `hug=`, `fan`, `align`, `grid`, arrow
`>` syntax, quoting rules for new-object text) eliminates the single largest token waste in the system.
Draft below, §4.2.

**(b) Rewrite `working_loop` to the v2 loop** (§2), replacing "render when a judgment call is open …
always once before committing". Draft below, §4.1.

**(c) Refusal etiquette:** partial fulfillment + counter-offer. When part of an instruction is
expressible, propose that part and say what was left out and why — never all-or-nothing abandon
(nested-arch S5), never silent dropping (flowchart S1 dropped Yes/No labels and the red path without
saying so; the commit summary must list unfulfilled clauses).

**(d) Lint-severity guidance:** overlaps and containment violations are commit-blockers; off-ladder
warnings are advisory during surgical ops; overflow measured against a stale frame is noise the agent
should re-derive (org-tree S1's cried-wolf lint trained the agent to ignore real overflow later).
(Prompt-side stopgap until 3.4(d) fixes the lint itself.)

**(e) Tool-description edits** (tools.ts strings, no behavior change): render_draft loses "always once
before committing" in favor of "after every solve that changes geometry"; propose_program's description
gains the omission-means-deletion warning *with the inspect-based recovery pattern* (swimlane S6 caught
it only by luck); commit's description requires naming known remaining flaws. Drafts in §4.3.

### 3.2 Language changes (parser/serializer + solver; the expensive tier)

Ranked by evidence-weight per unit cost:

| change | evidence | est. cost |
|---|---|---|
| **Arrow attributes: `label=`, `style=solid\|dashed`, `color=`** pass-through to the existing `connection.label` / `style` / color schema fields | State-machine's whole verdict ("missing its two load-bearing primitives"); swimlane S4; flowchart S1/S5. Agents *invented* these syntaxes unprompted — the vocabulary is already in their heads | 1–2 days (parse + serialize + ops emit; renderer already supports) |
| **Display text distinct from id** for new objects (`text=` is id, add `label="…"` — or quoted text everywhere) | nested-arch S2/S5 (id-as-label defect, then unfixable); org-tree S2 Drafts 1–2 | ~1 day |
| **Round-trip idempotence / size stability:** fit_scope emits committed geometry as authoritative; expander treats size class as *derived from* committed extent unless the program changes it; re-proposing the fitted program verbatim must be a no-op | size normalization 7×B, 0×P — the only mechanism with a perfect negative record. org-tree S5: a no-op edit moved boxes ~334–353px | 1–2 days fitter/expander; highest value-per-cost after arrows |
| **`pin <n>` (keep object at committed geometry through re-solve) + `nudge <n> dx= dy=` (rigid post-solve offset, 4px granularity, linted not refused)** | all five 20px-probes abandoned; "keep everything else in place" unsayable (flowchart S6, org-tree S5); R10's blind spot hit verbatim 5/5 | 2–4 days (solver: pinned objects become fixed constraints; nudges applied after solve, before lint) |
| **`align y@+off` register offsets and `fan` per-child pitch / cluster-gap equalization** | R10's own doc proposes the former; org-tree's uniform-pitch flaw (168/272/376px gaps) is the type's signature defect | 2–3 days |
| **Section-permeable routing corridors** (reserve inter-lane gutters as routable; let skip-lane edges thread between lanes instead of perimeter detours) | swimlane's dominant defect in all three committed renders (R9 2×B there) | 3–5 days (router) |
| **Self-loop rendering + forward/back edge separation on shared node pairs** | state-machine S1b: self-loop drawn through its own box; back-edge exactly overlapping forward edge | 2–3 days (router) |
| Fix `type=text` expander crash (`OBJECT_TYPE_DEFAULTS[item.type]` undefined) | state-machine S1b t16, raw JS error surfaced to the model | hours |

Deliberately **not** proposed: raw `at=(x,y)` coordinates. Every agent that reached for them was trying
to do a job `pin`+`nudge` does with the grid/ladder still advisory. R10's refusal of raw coordinates
survives the evidence; its refusal of *small relative offsets* does not.

### 3.3 Gate/lint retuning (solver-adjacent, small)

- **Wrecked gate: make it fire.** 0 fires in 33 sessions while a child section was committed 132px outside
  its parent (nested-arch S6 — the containment check exists in `wreckedLayoutError` but evidently doesn't
  cover solver-moved sections in this path) and a commit overflowed a locked frame by ~460px (state-machine
  S1b). Add: child-escapes-parent, locked-frame overflow beyond a threshold, and object-on-object overlap
  above ~25% area. 1–2 days including tests.
- **Lint: measure what mattered.** Add box-on-box overlap and label-truncation findings (the two most
  common visible defects, currently invisible); measure overflow against the *board frame*, not the scope
  bbox (org-tree S1's wolf-crying); suppress off-ladder findings on gaps the solver itself produced
  (swimlane S3's 117px, org-tree S3's 115px). 1–2 days.

### 3.4 Harness reliability (separate track, surfaced by the eval)

Container collision serving another session's transcript (state-machine S1a), two upstream-websocket
deaths, :3999 proxy death mid-eval, and `accept` returning ops without persisting (every eval agent had
to PUT the canvas itself — fine for the studio client, a trap for any other API consumer; either persist
server-side or document loudly). Not rule-related; filed here so it isn't lost.

## 4. Doc drafts

### 4.1 prompt.json — `working_loop` replacement

> 1. Call fit_scope first and read the program, legend, and boundary report.
> 2. Rewrite the program to satisfy the instruction and send it with propose_program.
> 3. Read the delta and lint reports. Fix parse errors and blocking lint (overlaps, containment) with
>    another whole-program proposal.
> 4. **Render the first solved draft — always.** Judge it against the instruction, and for
>    tighten/align/fix requests, against how the board looked before. Big structural misses → revise the
>    program. Small placement misses → surgical ops (pin, nudge, arrow attributes) that leave the rest of
>    the solve untouched.
> 5. **Render again after any change to geometry.** Commit only from a render you have seen. If a flaw
>    remains, either fix it or name it in the commit summary — never commit a defect silently.
> 6. If only part of the instruction is expressible, do the expressible part and report exactly what was
>    left undone and why. Abandon only when nothing useful can be proposed — and say what you would need.

### 4.2 prompt.json — new `program_reference` block (abridged; full grammar from serialize.ts)

> Statements: `section <n> text=… [hug=NW|NE|SW|SE]` · `item <n> [size=S|M|L] [at=N|S|E|W|NE|…]` ·
> `row <weights like 1|2|1> { … }` / `col … { … }` · `group <n>: <children>` ·
> `grid RxC gap=0|32|64|96` (cells row-major — preserves nothing about author order across rows) ·
> `align y: <n n n>` / `align x: …` · `fan <n> dir=S: <children>` · arrows: `<n> > <n>`
> [`label="…"` `style=dashed` `color=<roster>` when 3.2 lands].
> Gaps come from the closed ladder 0/32/64/96 (cluster ≥128). Sizes are the closed set S/M/L.
> Numbers are identity; omission is deletion; every proposal is the whole program.
> New objects: `text="Display Label"` — the quoted form is the on-canvas label.

### 4.3 tools.ts description edits

- `render_draft`: "…Use it **after every solve that changes geometry, starting with the first** — judge
  the draft against the instruction and the prior board, then adjust. Never commit from reports alone."
- `propose_program`: append "Before sending, verify every legend number appears in your program —
  a missing number silently deletes that object; `inspect` the full id list if unsure."
- `commit`: "…The summary must name any flaw you saw in the final render and chose to ship."
- `abandon`: "…If part of the instruction was expressible, propose that part instead and describe the
  rest in the commit summary; abandon only a fully-blocked instruction, and state what operation you
  lacked."

### 4.4 Rulebook doc updates (docs/30-agent-layout/20-rulebook)

- **R6 fan:** document the hub-beside-children gap (never engaged on nested-arch's 5-edge bus) and the
  uniform-pitch ⇒ unequal-cluster-gap theorem (org-tree); note per-child pitch as the planned extension.
- **R9:** document lane-impenetrability (swimlane detours) and the self-loop/anti-parallel-edge failure
  modes as known limits pending 3.2 router work.
- **R10:** update from "one known blind spot" to the empirical list: fine offsets (5/5 probes refused),
  connector attributes, display labels, keep-in-place — with pointers to which are getting ops (3.2) and
  which remain refused (raw coordinates).
- **New: R11 round-trip stability** (once 3.2 idempotence lands): re-fitting a committed board and
  re-proposing it unchanged is a geometric no-op; size classes describe committed extents, they do not
  overwrite them.

## 5. Addendum (same day): the reference-board comparison, and why it changes the architecture

Ford's pushback after the eval: the reference boards (bubba-voice, gc-decomp-harness,
intent-classification-2 — hand-drawn in Figma or hand-seeded, then agent-iterated) look
*significantly* better than anything the rule pipeline produced. Side-by-side inspection confirms it,
and locates the gap precisely. What the reference boards have that no eval board has:

1. **Color as a working layer, not decoration.** Section-identity tints (gc: green config / blue runner /
   purple score-gate / pink knowledge / orange PR-handoff / teal state / red health); edge colors that
   trace a subsystem's flow across shared space; role-typing by fill (intent-2: blue classifiers, purple
   actions, yellow context). Color does grouping and flow-disambiguation work geometry cannot.
2. **Every edge labeled** (gc: "load config", "assign claims", "yes · match", "no · retry" chips sitting
   on the connectors). Eval boards: zero edge labels, anywhere.
3. **Line vocabulary:** dashed vs solid, colored by flow; long sweeps stay legible *because* color+labels
   disambiguate them. Eval boards: every line identical gray solid.
4. **Shape/icon vocabulary:** person/shield/chip glyphs, speech bubbles, pills vs rects vs
   pentagons/triangles/trapezoids with role semantics. Eval boards: rounded rects only.
5. **An annotation layer:** margin stickies and text blocks carrying the design rationale. Eval boards:
   none (and `type=text` crashes the expander).
6. **Intentional density variation:** dense hero flow, airy margins, small satellite clusters. Solver
   output is uniform-pitch and frame-filling.

The decisive observation: **the eval boards' *geometry* is mostly fine** — the org tree's structure,
the lanes' rhythm, the registers are all solver wins. Every one of the six gaps above is a channel the
canvas schema supports and the layout-program pipeline strips. This is partly by design — the system
prompt says "You never edit text or colors." A geometry-only editor can only ever produce the gray
skeleton of a good board, no matter how good its rules get.

**Consequence — v3 direction (supersedes the v2 emphasis in §3.2 on extending the DSL):** stop treating
the language as the authoring format. Invert the architecture:

- The agent authors against the **canvas document** via the ops/patch vocabulary the studio UI itself
  uses (it already exists — `accept` returns exactly these ops): move/resize, set color, set connector
  label/style, set text, add sticky/annotation. Full channel access, same as a hand.
- The **solver becomes a tool, not a cage**: a `solve_layout` call on a selection ("arrange these as a
  fan / grid / lanes / align these") for the structural moves that are genuinely hard by hand — R5/R6/R4/
  R3 are the proven wins. Rules act as a layout *service* plus advisory lint (ladder/grid as suggestions,
  overlaps/containment as hard gate on every patch).
- The loop stays render-first (§2): structure pass → render → free-hand fine-tune via ops with lint
  advice. "Power steering, not rails."
- **Reference-guided generation:** the corpus boards are style exemplars; include one downscaled
  exemplar render of the target genre in build-session context. Today the agent has never seen what a
  good board looks like — the cheapest single step toward hand quality.

This matches both evidence sets: the eval showed agents always *knew* what they wanted (they kept
inventing syntax for it) and rules earned their keep only on structure; the reference boards show the
winning workflow is "block in structure, then iterate with eyes and full channels" — which is exactly
how they were made. Note the inversion of today's design: currently the solver owns everything and
hand-ops don't exist; the reference boards were made with hand-ops owning everything and no solver.
The bridge is both: hand-equivalent ops for what's easy by hand (drag 20px, recolor, label an edge),
solver for what's hard by hand (balance, registers, even pitch).

Cost note: the op channel and schema support already exist; the new work is exposing ops as agent tools
+ lint-on-patch + the `solve_layout` tool wrapper around the existing fitter/solver. Likely *less* code
than extending the DSL grammar in six directions, and it makes several §3.2 rows (arrow attributes,
display text, pin/nudge) fall out for free as plain document ops.

## 6. Addendum 2 (same day, post-v3-trials): graph layout, not box packing — the v4 direction

Ford's verdict on the v3 trial boards: better than v2's, still bad — "if my existing diagrams are
a 7 or 8, these are a 2 or 3, the first eval set was a 1." His instinct: prune the DSL to a
relationship declaration and make layout something the system does.

Diagnosis of the 2–3: v3 opened the channels but the trial agents went ~100% freehand apply_ops
(see v3-trial-summary "solver abstinence"), so composition now rests on the model's freehand
spatial judgment — no ranks, no corridors, floating label chips, arbitrary dead space. The v2
solver couldn't help: it is a *box-packing* engine (splits/weights/bands mined from corpus
geometry). What diagrams need is *graph drawing* — rank assignment, crossing minimization,
orthogonal routing, label placement. Ford's hand boards read well because he manually does what
a layered graph layout does. That is a solved problem; neither more corpus rules nor model
freehand should re-derive it.

**Prototype evidence (this directory):** `proto-layout-dagre.ts` (~70 lines) feeds the
eval-v3-state-machine board's existing semantics — nodes, edges, labels, styles, colors,
untouched — through dagre's layered layout (ladder-derived spacing: ranksep 128 / nodesep 64 /
edgesep 32, 16px snap), then lets the repo's own elbow router route on the new positions.
Compare `proto-freehand-state-machine.png` (v3 freehand, 2–3) with
`proto-dagre-state-machine.png` (derived, arguably 5–6). Zero model involvement in the delta.
Notable: dagre's own bendpoints snapped poorly (S-hooks); **dagre positions + our router's
routing** was the winning combination.

**The v4 shape this implies:**
- The "pruned DSL" doesn't need to be a language at all. The relationship declaration IS the
  document: nodes + connections + groups + channels, which the agent already authors well via
  apply_ops (v3 trials: intent-fidelity essentially solved).
- `solve_layout` swaps its engine: layered graph layout (dagre now; ELK when compound/section
  support is needed) instead of the fit→expand box packer. Corpus rules survive as engine
  configuration (16px grid, ladder gaps, R3 trim for sections) and as lint.
- Loop unchanged from v3: author semantics → solve_layout (graph engine) → render → surgical
  polish with ops. The agent's jobs become the two things it's actually good at: getting the
  semantics right, and judging renders.
- Sticky/annotation placement: margin-parking heuristic first (prototype does a crude version);
  proper margin bands later.

**Costs:** dagre behind solve_layout for flat genres (flowchart, state machine, org tree):
~1–2 days including ladder/grid config + tests (dagre is pure JS, Bun-clean). Compound layout
for swimlanes/nested sections: ELK via a node subprocess (elkjs's bundled build fights Bun's
worker model) or ELK's java CLI — ~3–5 days, or interim: keep v2's lane/section packing for
containers and dagre for the graph inside each. The fit_scope program/propose_program surface
can then shrink to a debugging view rather than an authoring interface.

## 7. The scale answer

**Universal across all five types** (safe to fix once, globally): the grammar-guessing tax; the missing
arrow/label/style/text channels; the fine-offset refusal; size-normalization drift; whole-scope re-solve
churn under "change one thing" instructions; the single-render habit; lint aimed at the wrong targets;
the silent gate.

**Type-specific** (needs per-genre attention, and per-genre eval coverage): swimlane lane-crossing
routing; state-machine self-loops and anti-parallel edges; org-tree fan-pitch/cluster-gap tension and
port-side connector entries; nested-arch band-stretch and child-section escape; flowchart sensitivity of
decision diamonds to size reclassification. Note the pattern: each genre's *defining idiom* is what the
system handles worst, because the corpus rules were mined from boards that are none of these genres.

**The regression suite is this workflow.** Concretely:
- Freeze the five instruction scripts (build + 3 edits + nudge probe per type) as fixtures; keep the five
  `eval-*.canvas.json` scratch canvases as seeds (they're in `canvases/`, reproducible from this eval).
- One evaluation agent per type, in parallel, against the live harness; findings in the fixed
  `findings-<type>.md` schema (PROTOCOL.md in this directory is the reusable harness).
- The scorecard matrix regenerates mechanically from the tallies; a rule change is judged by its
  P/B/N delta and by four scalar gates: total parse-failures-to-first-solve, committed-with-visible-defect
  count, honest-abandon count on the probe battery, renders-per-session.
- Cost per full run: ~30 sessions of codex-lb tokens + 5 agent-hours wall-clock (this run: ~25–45 min/agent).
  Run it on any change to grammar, solver constants, lint, gate, or the system prompt — the five genres
  exercise disjoint rule subsets, which is exactly why five cheap diagrams beat one expensive one.
- When a new diagram genre matters (ER diagrams, timelines, mind maps), add a sixth script — the finding
  that "each genre's defining idiom is the failure mode" predicts new genres will surface new gaps the
  corpus rules can't see.
