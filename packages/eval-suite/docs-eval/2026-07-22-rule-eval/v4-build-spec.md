# v4 build spec — frozen interfaces + work split

Approved by Ford 2026-07-22 (with the color rule added). Build with FABLE agents only — the
Codex CLI must NOT be used for any part of this build (explicit user instruction; overrides
global CLAUDE.md). Design rationale: `v4-diagnostic-layout-design.md`. Do not commit to git.

Open decisions resolved as the design doc's leans: error tier as listed; full digest +
diagnostics in every apply_ops result; propose_program/solve_layout demoted (kept working,
marked in descriptions as rarely needed) — NOT deleted; one house exemplar (unchanged).

## Frozen interfaces — code against these EXACTLY (Phase-1 agent implements them verbatim in
`packages/canvas-agent/src/digest/board-model.ts` and `packages/canvas-agent/src/rules/types.ts`)

```ts
// digest/board-model.ts
export interface BoardNode {
  id: string; type: string; color?: string; text: string;
  x: number; y: number; width: number; height: number;
  parentId: string | null;             // section membership (geometry-derived, as stored)
  kind: "section" | "sticky" | "annotationish" | "node";  // annotationish: annotation-marker
  locked?: "all" | "background";
}
export interface BoardEdge {
  id: string; fromId: string; toId: string;
  label?: string; style?: "solid" | "dashed"; color?: string; arrow?: string;
  waypoints?: [number, number][];      // as stored; may be absent
}
export interface BoardModel {
  frame: { x: number; y: number; width: number; height: number } | null;  // locked background section rect
  nodes: BoardNode[];                  // ALL objects incl. sections/stickies (kind discriminates)
  edges: BoardEdge[];
  childrenOf(id: string): BoardNode[];
  byId(id: string): BoardNode | undefined;
  siblingsOf(id: string): BoardNode[]; // same parentId, excluding self, excluding stickies/annotationish
}
export function buildBoardModel(doc: InteractiveCanvasDocument): BoardModel;
export function formatBoardDigest(model: BoardModel): string;   // the BOARD block (see design §3a)

// rules/types.ts
export type Severity = "error" | "warning";
export interface Diagnostic {
  id: string;            // assigned by the runner: E1.., W1.. — stable within a session turn set
  rule: string;          // rule id
  severity: Severity;
  at: string[];          // object/edge ids involved
  where?: { x: number; y: number; width: number; height: number };  // croppable region
  message: string;       // one line: measured fact + location, e.g. `gap Idle↔Connecting 117px`
  suggestion?: string;   // e.g. `nearest rungs 96 / 128`
  quickfixAvailable: boolean;
}
export interface LayoutRule {
  id: string; title: string; tier: Severity;
  guidance: string;      // prose for the prompt; defaults-not-laws voice; 3-8 lines
  check(board: BoardModel): Omit<Diagnostic, "id" | "quickfixAvailable">[];
  quickfix?(board: BoardModel, d: Diagnostic): AgentPatchOperation[];  // ops to fix THIS finding
}

// diagnostics/run.ts
export function runDiagnostics(board: BoardModel): Diagnostic[];  // registry order; errors first;
  // ids assigned E1..En then W1..Wn in stable (rule-order, then position) order
export function formatDiagnostics(diags: Diagnostic[]): string;   // the DIAGNOSTICS block
```

Numbering stability: within one propose/apply cycle, re-running diagnostics on an unchanged
board yields identical ids. Ids reset per run — the model tracks them turn to turn.

## Phase 1 — spine (one agent; blocks Phase 2 rules agents)

Files owned: `src/digest/*`, `src/rules/types.ts`, `src/rules/index.ts` (registry),
`src/diagnostics/*`, `src/harness/session-store.ts`, `src/harness/tool-runtime.ts`,
`src/harness/agent-catalog/layout-editor/tools.ts`, plus tests for all of it.

1. Implement the frozen interfaces. `buildBoardModel` derives `parentId` the same way the
   draft does today (reconcileSectionMembership is already applied on mutation — read stored).
2. Registry (`rules/index.ts`): ordered list; seed it by MIGRATING two existing checks so the
   spine is provable end-to-end: `spacing` (from pipeline/lint.ts SpacingViolation) and
   `containment` (from wreckedDocumentError's section-containment + frame-overflow, tier
   error). Remaining rules arrive in Phase 2 — registry must tolerate additions by file.
3. New tool `board`: returns formatBoardDigest + formatDiagnostics for the current draft.
   First call also carries the house exemplar png (move the exemplar from fit_scope here).
4. apply_ops result: replace the current advisory text with digest + diagnostics (full, every
   time). solve_layout results likewise.
5. New tool `apply_quickfix({ diagnosticId })`: re-runs diagnostics to locate the id, invokes
   the rule's quickfix, applies the ops through the same path as apply_ops (validation,
   membership, events), returns new digest+diagnostics. Error if no quickfix available.
6. Commit gate: replace wreckedDocumentError/sketch-gate with: commit blocked iff error-tier
   diagnostics exist (scope-filtered as today: restrict to scope + created ids). Warnings
   never block; unresolved warnings are appended to the proposal payload for operator review.
7. Demote (do not delete): fit_scope keeps working but its description says "legacy program
   view — prefer board"; exemplar moves to `board`. propose_program/solve_layout descriptions
   note "rarely needed — the board is yours to place directly".
8. Config: agent.json `thinking` "low"→"high", `maxTurns` 60→120. render_draft default
   pixelWidth 1400→2000 (keep the 4096 raster cap).
9. Tests: board-model (containment, siblings, digest text), runner (ordering, stable ids),
   spacing + containment checks migrated (port the existing lint/gate test cases), quickfix
   path, commit-gate-on-errors, board tool exemplar-on-first-call. Suite baseline 156/0 —
   keep everything green; delete tests only where they pin the OLD gate/lint surface you are
   replacing (justify each deletion in your report).

## Phase 2 — parallel after Phase 1 lands

**Agent R1 — geometry rules** (files: `rules/grid.ts`, `section-trim.ts`, `registers.ts`,
`hub-balance.ts`, `rhythm.ts` + one test file per rule):
- grid W: off-16px x/y/w/h (report values; ignore sub-pixel noise <1px).
- section-trim W: header band <48px effective, side padding <24px, or section not hugging
  (>160px slack per side) — thresholds as constants, cite R3's 64/48 in guidance.
- registers W: ≥3 non-section nodes from ≥2 parents whose centers are within 8px of a shared
  axis but not exactly aligned → "align or separate". Quickfix: snap to median register.
- hub-balance W: node with ≥3 same-side edges whose center is >32px off its targets' midpoint.
  Quickfix: center hub over midpoint.
- rhythm W: ≥3 same-parent siblings along one axis with gap variance >16px (the cram case).
  Quickfix: even the gaps to the median rung.

**Agent R2 — clarity + color rules** (files: `rules/density.ts`, `label-clearance.ts`,
`overlap.ts`, `edge-clarity.ts`, `color-contrast.ts` + tests):
- density W: a section (or frame) whose content bbox leaves >45% empty on one side; orphan
  node >512px from every neighbor.
- label-clearance E: an edge-label chip rect (estimate: label.length*8+24 × 28 at the edge
  midpoint or stored label position if the renderer exposes one — use midpoint of the
  from/to segment or first waypoint segment) intersecting a node rect or another chip rect.
- overlap E: two non-section, non-sticky, non-annotationish siblings whose intersection
  exceeds 25% of the smaller, OR any intersection that covers a node's text center.
- edge-clarity: through-box E (port countPathBoxViolations usage from lint); anti-parallel
  pair sharing both endpoints W; degenerate/zero-length route W; crossings count >N (start
  N=6) W with the count in the message.
- color-contrast W: (a) two sibling sections same color; (b) a node whose color equals its
  parent section's color; (c) >70% of one section's nodes sharing one hue when ≥4 nodes
  (monotony). Guidance face: distinct tints per sibling section; children contrast their
  parent; reserve semantic colors (red = failure/error paths, green = success/terminal-good);
  vary within the 10-roster rather than defaulting everything gray.

Both agents: rules must be registered in `rules/index.ts` (append; R1 order before R2 except
error-tier rules float via severity, runner handles ordering), each with guidance in the
defaults-not-laws voice, each with tests (positive finding, clean board, threshold edge).

**Agent P — prompt + assembly** (files: `scripts/assemble-prompt.ts` (new),
`agent-catalog/layout-editor/prompt.json` + `prompt.rendered.md`; may run after Phase 1 in
parallel with R1/R2; coordinates with no one else's files):
- Script reads the rules registry and regenerates the `<layout_guidance>` section of
  prompt.json from each rule's guidance face (registry order), then re-renders
  prompt.rendered.md byte-consistently (reuse the existing kernel renderer approach used
  2026-07-22 — see git history / earlier regeneration).
- Rewrite `<purpose>`/`<working_loop>`/`<board_model>` per design §3b: digest reading, batch
  placement, render-full-then-crop habit, error/warning etiquette (fix errors; warnings are
  judgment — fix, quickfix, or override BY ID in the commit summary), blank-board section-
  skeleton-first flow.
- Tool description updates for `board`, `apply_quickfix`, demoted solver tools.
- Test: assembled prompt contains every registered rule's title; regeneration is idempotent.

## Phase 3 — integration (orchestrator)

Suite green (target: all existing + new), typecheck, harness restart, one smoke session on a
BLANK new canvas (`eval-v4-smoke`) exercising: build from empty with sections, diagnostics
visible in transcript, at least one quickfix invocation or explicit warning override, commit
with warnings listed. Then judge the render against the 7–8 bar and report.
