# v5 plan — graph lints + skills + fresh perception (change & deprecation list)

Ford's direction (2026-07-22, evening): system prompt stays static and small; per-turn context
carries the condensed digest + close-up images of what changed; hard rules become **graph
lints** (rough, objective errors only — things getting covered up); stylistic rules stop being
per-turn warnings and become **skills** the model pulls; a lot of files are no longer needed.

Status: PLAN ONLY. Build starts after Round-1's five efficacy tables land (three still
running). Rule-efficacy evidence so far cited inline (state-machine + swimlane reports).

## 1. The three tiers (replacing the flat 12-rule registry)

### Tier A — graph lints (`src/lints/`) · error/warning · always on · rough by design
Objective wreckage only. Generalized thresholds — catch what's *broken*, never police style.

| lint | from | notes |
|---|---|---|
| covered-content (E) | overlap.ts + label-clearance.ts merged | anything hiding text/content: box-on-box, chip-on-box, chip-on-chip |
| containment (E) | containment.ts | child outside section; off locked frame |
| broken-edges (E/W) | edge-clarity.ts, extended | through-box E; degenerate/dangling E; NEW rough checks from Round 1: co-linear shared runs (dashed-over-solid ≥100px), border-hugging (≤12px for ≥200px), stranded chips (label far from its run) — the routing debt that shipped invisibly in swimlane S1/S3 |
| unreadable-labels (W) | spacing.ts labeled-edge check only | WORKING verdict 2× in Round 1; keep exactly as is |
| frame-balance (W) | NEW | rough occupancy: >~40% of the frame dead on one side at commit time — the "rebalance had nothing to push against" gap (state-machine S2) |

That's the whole always-on surface: ~5 lints. Commit gate = the E tier, unchanged mechanics
(stable ids, scope filtering, override-by-id etiquette all stay).

### Tier B — style files (`src/styles/`) · one file per topic · ALL injected into context
REVISED per Ford (2026-07-22, late): NOT a pull-tool — "skills" was only framing. Every style
topic is its own file (prose, the craft knowledge), and a `styleGuideContext` loader
concatenates ALL of them into the session context. Context bloat is explicitly accepted for
now — the goal is that the full stylization corpus is represented in-context and visible in
the context renderer. No `recipe` tool. Reference imagery stays on the image channel (house
exemplar with the first `board` call — context blocks are text-only in the kernel). Auto-fix
tools (e.g. containment auto-expand / graph auto-balance) are noted as a FUTURE possibility,
not built now; `apply_quickfix` stays as is.

| skill | from rule | reference crop |
|---|---|---|
| spacing-and-corridors | spacing ladder + section-trim prose | gc-decomp score-gate corridor |
| fan-composition | hub-balance + R6 | intent-2 layer tree |
| registers-and-rhythm | registers + rhythm | gc-decomp hero row |
| section-framing | section-trim + density prose | gc-decomp Runner+Agent Loop |
| color-semantics | color-contrast | intent-2 role typing / gc section tints |
| lanes-and-corridors | (swimlane-specific prose, new) | bubba task-manager columns |
| tree-edge-entry | NEW (org-tree R1: side-entry elbows are the top unfixed defect v2→v4) | teach `from/to.anchor` — exit parent bottom, enter child top; ref: intent-2 fans | 
| grid-discipline | grid | (prose only) |

Round-1 calibration notes to fold in during the tier split: hub-balance must exclude
dashed/exception edges from the fan-child set (org-tree false positive + two masked real
misses); rhythm must compare gap-classes (gutters with gutters); color-contrast must respect a
user-stated palette (monotone-by-request is not monotony); labeled-edge breathing check missed
a tangled label in org-tree S1 — verify its adjacency window against that case.

Efficacy evidence for the demotion: section-trim was Round 1's noise king (~22 of 31 warning
lines, re-fired every turn, batch-overridden); hub-balance MISCALIBRATED (every override was a
correct rejection); grid/rhythm/registers mostly quiet or advisory-shaped. None of these are
*wrong* as craft — they're wrong as per-turn nagging.

### Tier C — the static system prompt · shrinks to identity + loop
Purpose, channels, working loop, lint etiquette, and ~8 lines of core taste (grid, breathe,
contrast, don't hide content, look before committing, pull a recipe when attempting a pattern).
The 60-line `<layout_guidance>` wall is DELETED from the prompt.

## 2. Per-turn perception (the context mock)

Spawn (kernel contexts, visible in the trace viewer's context renderer):
```
<editor_state>      selection, viewport, annotations            (unchanged loader)
<board_state>       full digest + full lint report + house exemplar image   (new loader)
```

Every apply_ops / apply_quickfix RESULT (the per-turn channel — tool results carry images):
```
APPLIED · 4 ops (moved state-degraded, state-reconnecting; recolored edge-…; added note-…)
DELTA
  state-degraded      1480,500 → 1720,450
  state-reconnecting  1480,880 → 1900,1050
  edge-connected-degraded  color gray → orange
LINTS · +1 −2
  + W3 unreadable-labels: "quarantine" chip 62px gap, needs ≥120
  − E1 covered-content, − W1 frame-balance          (resolved)
[image: 800px close-up crop of the touched region's bounding box + 96px ring]
```
Full digest / full board render stay on demand (`board`, `render_draft`). This replaces the
current full-digest-every-turn firehose — leaner context over a 120-turn session, and the model
*sees* every change it makes without asking.

## 3. Deprecation list

### Deleted outright (superseded by v4/v5; nothing imports them after the tier split)
- `src/pipeline/serialize.ts`, `parse` half of `route.ts` (parseSketch/program grammar),
  `expand.ts` (the solver; SPACING_LADDER + GRID constants move to `src/lints/constants.ts`),
  `diff.ts` (diffPrograms — diffDocuments in doc-diff.ts is the only differ),
  `occupancy.ts` (ASCII occupancy — superseded by close-up crops)
- session-store: `buildDraft`, `lastSketch` machinery, `wreckedLayoutError` (already vestigial),
  fitScope/propose/solve plumbing (`toolFitScope`, `toolProposeProgram`, `toolSolveLayout`,
  `connectionInventoryText` — inventory lives in the digest)
- tools: `fit_scope`, `propose_program`, `solve_layout` registrations
- `scripts/assemble-prompt.ts` + the prompt drift test (no generated prompt section remains)
- `src/rules/` directory dissolves into `src/lints/` + `src/skills/`
- tests that pin the deleted surface: `round-trip`, `scope`, `nested-section-solve`,
  `expand-mode`, `no-crossing` (its routing cases move to broken-edges tests),
  `occupancy-ascii`, `session-store-wrecked-gate`, `diff` (program differ), prompt-assembly
  drift portions, solver-tool tests (`session-store-solve-layout`, parts of accept tests that
  exercise the sketch-rebase path — accept keeps only the doc path + 409)
- KEPT from pipeline: `route.ts` routing half (`directElbowEdges`, `countPathBoxViolations` —
  lints + renderer parity), `doc-diff.ts`, `lint.ts` only until its checks finish migrating
  into lints/, then deleted.

### Deprecation safety
`packages/canvas-agent` is largely UNTRACKED in git — deletion is unrecoverable. Before the
deletion pass, either (Ford's call): (a) Ford makes a checkpoint commit of the current tree, or
(b) deleted files move to `packages/canvas-agent/attic/` (out of the build, greppable) and die
for real after v5 proves out in Round 2. Plan assumes (b) unless told otherwise.

### Explicitly NOT deprecated
`apply_ops`/`apply_quickfix`/`board`/`render_draft`/`inspect`/`commit`/`abandon`, the digest,
diagnostics runner mechanics (ids/tiers/gate), doc-diff, accept/reject/message flow, the studio
op bridge, updateConnection reducer, the canvases, the eval corpus, rulebook docs (human docs;
get a v5 note), agent.json config (thinking high stays).

## 4. Build order (after Round 1 lands)

1. Tier split: lints/ + skills/ + registry rewiring; runner unchanged; ~½ day.
2. New lints (frame-balance; broken-edges extensions) — grounded in Round-1 verdicts; ~½ day.
3. `recipe` tool + reference crops (pre-render crops into `assets/recipes/`); ~½ day.
4. Perception: delta digest + lint deltas + auto close-up in apply_ops results; board_state
   spawn context (loader); prompt shrink; ~½–1 day.
5. Deprecation sweep to attic/ + test prune; suite green; ~½ day.
6. Round 2: same five-genre battery, same anchored protocol, on v5.

Open question for Ford: any steering-mid-loop rounds in the Round-2 battery (interactive
message-channel polish), to mirror how gc-decomp was actually made?
