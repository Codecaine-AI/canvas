# v4 — diagnostic layout: design draft (no code yet)

Direction settled in brainstorm with Ford, 2026-07-22 evening:
- The solver doesn't matter much. The model places and adjusts, looking at renders.
- Rules become two paired things: **prose guidance baked into the prompt** ("here's generally
  how things should be laid out") and **accompanying diagnostics** (warnings/errors the model
  resolves as it sees fit). Nothing deterministic fixes the board.
- Quality over speed and tokens. Slower sessions, bigger images, more thinking are accepted
  costs. Efficiency later.
- Evidence base: gc-decomp-harness (7–8) was made by an LLM freehand with no rule system;
  v2 DSL scored 1, v3 ops+gate scored 2–3; the old scorecard shows rule value was detection,
  rule harm was enforcement (`scorecard.md`, `v3-trial-summary.md`).

## 1. Organizing principle

**One rule, one file, two faces.** Every rule module carries its prompt guidance and its check
together, so the prompt and the linter share a single source of truth:

```ts
// packages/canvas-agent/src/rules/spacing.ts (illustrative shape)
export const rule: LayoutRule = {
  id: "spacing",
  title: "The spacing ladder",
  tier: "warning",                     // "error" | "warning"
  guidance: `
    Sibling gaps come from the ladder {0, 32, 64, 96}; unrelated clusters sit 128+ apart.
    Flush (0) is for repeated cells; 64 is the default sibling gap; use 96 when a connector
    label needs room. Deviate when the diagram calls for it — this is a default, not a law.`,
  check(board: BoardModel): Diagnostic[] { /* measured, located findings */ },
  quickfix?(d: Diagnostic): AgentPatchOperation[],   // OPT-IN — only runs if the model asks
};
```

- `guidance` is assembled into the system prompt at build time (script regenerates
  prompt.json/rendered.md — same pipeline as today).
- `check` runs after every apply_ops / on demand / at commit, producing diagnostics.
- `quickfix` is an offer, never automatic: the model may invoke `apply_quickfix(diagnosticId)`
  and owns the result. Determinism at the granularity of one accepted suggestion.

## 2. File tree

```
packages/canvas-agent/src/
  rules/
    index.ts               # ordered registry; prompt assembly + diagnostics runner read this
    grid.ts                # R1  · warning · off-grid geometry (report, don't snap-block)
    spacing.ts             # R2  · warning · off-ladder gaps, measured + nearest rung
    section-trim.ts        # R3  · warning · header band / padding / hugging drift
    registers.ts           # R5  · warning · near-register misalignment ("4px off — align or separate")
    hub-balance.ts         # R6  · warning · hub off children's midpoint (measured px)
    rhythm.ts              # new · warning · uneven sibling pitch (the "Lint: clean" cram case)
    density.ts             # new · warning · dead-space imbalance, orphaned regions
    label-clearance.ts     # new · ERROR   · label chip occludes chip/node text
    overlap.ts             # new · ERROR   · box hides box content (>25% or text covered)
    containment.ts         # new · ERROR   · child outside its section; object off locked frame
    edge-clarity.ts        # R9  · mixed   · through-box = ERROR; crossings count, anti-parallel
                           #                 overlap, degenerate/invisible edge = warnings
    color-contrast.ts      # new · warning · sibling sections share a hue; a node's color equals
                           #                 its parent section's tint ("green on green"); one hue
                           #                 dominating a section (monotony). Guidance: distinct
                           #                 tints per sibling section, children contrast their
                           #                 parent, reserve semantic colors (red=failure, etc.)
  digest/
    board-model.ts         # BoardModel: typed relational digest built from the draft
    format.ts              # digest → the text block the model reads
  diagnostics/
    run.ts                 # BoardModel → Diagnostic[] via rules registry
    format.ts              # diagnostics → tool-result text (stable ids, stable ordering)
  harness/ ...             # session-store keeps ops/render/commit; solver tools demoted (§5)

docs/30-agent-layout/20-rulebook/   # stays as the human story; each doc links its rule module
```

Old pipeline pieces (fit/expand/serialize/route) stay in-tree but stop being load-bearing;
`pipeline/lint.ts` and `wreckedDocumentError` migrate INTO `rules/*` (they are the seeds of
overlap/containment/edge-clarity/spacing).

## 3. The representations

### 3a. Board digest ("what is attached to what")

Replaces fit_scope's program echo as the model's structural view. Returned by a `board` tool,
after every apply_ops batch, and at session start. Facts from data; screenshots for judgment.

```
BOARD eval-v3-state-machine · frame 32,32 2336×1536 (locked)
SECTIONS
  page-frame "Eval v3 — State Machine" (white)
    └─ (no subsections)
NODES                                   # id · type · color · "text" · x,y w×h
  seed-idle        process gray   "Idle"          240,688  200×100
  state-connecting process blue   "Connecting"    600,300  240×120
  ...
EDGES                                   # id · from→to · "label" · style/color
  edge-idle-connecting      seed-idle→state-connecting      "connect()"  solid gray
  edge-connecting-idle      state-connecting→seed-idle      "timeout"    dashed red
  ...
STICKIES / ANNOTATIONS
  note-degraded-loop yellow "Degraded loop: …" 1920,780 280×180

DIAGNOSTICS · 1 error · 3 warnings
  E1 label-clearance: "quarantine" chip covers "session resumed" chip @ (1490,830 180×28)
  W1 spacing: Idle↔Connecting gap 117px (rungs: 96 / 128)
  W2 registers: Connected/Degraded/Suspended y-centers within 6px — align or separate
  W3 hub-balance: CEO 96px left of its children's midpoint
```

Stable diagnostic ids (`E1`, `W2`) persist across renders so the model can track what it fixed,
target `apply_quickfix("W2")`, or override by id in its commit summary.

### 3b. Prompt shape (generated)

```
<purpose>            board editor; full channels; scope discipline; operator reviews commits
<board_model>        how to read the digest; screenshots judge, digest states facts
<layout_guidance>    ← the rules' guidance faces, in registry order, framed as
                     "generally how things should be laid out" — defaults, not laws
<working_loop>       1 read digest+diagnostics+exemplar → 2 plan the flows →
                     3 place in batches (one apply_ops per region/flow is fine) →
                     4 render (full board for composition, crops for detail; big pixelWidth) →
                     5 fix errors; judge warnings — fix, quickfix, or consciously override →
                     6 commit: errors must be clear; overridden warnings named in the summary
<channels>           colors/styles/labels/types (as v3)
```

### 3c. Session config (when we build)

- Same model (SOL is frontier); `thinking` low → medium/high. maxTurns 60 → ~120.
- render_draft default pixelWidth up (1400 → 2000+); crops encouraged in the loop.
- Commit gate = error-tier diagnostics only. Warnings never block; unaddressed ones are
  listed in the proposal for operator review.

## 4. Loop sketch — Ford's blank-board scenario

Blank diagram, "lay out the sections and the flow": the model reads guidance + exemplar,
places the section skeleton in ONE apply_ops batch (sections are just objects), renders full-
board, adjusts proportions, then fills each section in per-region batches, rendering between
passes, then a connector pass, then a diagnostics-driven polish pass, then commit. Nothing
stops multi-node batches — ops arrays already do this; the loop guidance just says render
between meaningful batches, not between individual ops.

## 5. What happens to the solver surface

- `fit_scope` → replaced by `board` (digest + diagnostics). The program echo dies.
- `propose_program` → candidate for deletion after a deprecation trial (kept only if usage
  shows the model reaching for whole-scope re-solves; v3 trials suggest it won't).
- `solve_layout` → optional tool, explicitly framed as a cold-start suggestion the model may
  take or ignore (dagre first-pass lives here if we ever want it; see process-proposal §6).
  Candidate for deletion on the same usage test.
- Wrecked gate / lint → absorbed into the error/warning tiers of `rules/*`.

## 6. Open decisions (for Ford)

1. **Error-tier membership.** Proposed errors: content-hiding overlap, chip occlusion,
   child-outside-section, off-locked-frame, edge-through-box, invisible/degenerate edge.
   Everything else warns. Too strict / too loose?
2. **Digest frequency.** Full digest every apply_ops result vs. diagnostics-only with digest
   on demand (`board` tool). Full-every-time is simpler and tokens are declared acceptable.
3. **Solver retirement.** Delete propose_program/solve_layout now, or demote + measure usage
   for a while first? (Design assumes demote-then-measure.)
4. **Exemplar policy.** Keep one house-style exemplar always, or per-genre exemplars chosen
   by instruction keywords?

## 7. Build estimate (when green-lit — explicitly NOT started)

BoardModel + digest formatting ~1 day (consolidates existing inventory/containment code);
rules registry + migrating existing checks + the four new checks (rhythm, density,
label-clearance, overlap refinements) ~2–3 days; prompt regeneration pipeline ~½ day;
config knobs trivial. Re-run the five-genre trial battery as the acceptance gate, judged
against the 7–8 bar, not the old 2–3.
