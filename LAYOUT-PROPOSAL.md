# Layout Proposal — Session 1 (Layout Overhaul)

Status: **EXECUTED AND FROZEN — 2026-07-09.** Commits `461a0a4..1abd832`
plus the freeze commit. All gates held throughout: typecheck clean, the
6-failure baseline set byte-stable at every commit, DOM verified identical
through the zz-dom gate, studio boots and serves all 8 fixtures. See
"As executed" at the end of this file for deviations and the updated
deferred queue. This document is now the structural input for the docs
session (DOCS-OVERHAUL.md).

> **⚠ Flag on the OBJECT-DEF-OVERHAUL.md deletion (Part 1, item 11):** the
> inventory found ~25 root-relative citations to it (source comments, 6 test
> files using its tables as matrices, 3 `doc.json` citations), and the docs
> currently *cite it by decision id* rather than restating the rationale.
> Deleting it is behaviorally safe (nothing imports it; recoverable from git
> history), but if any D1–D19 rationale is not actually in `docs/`, it exists
> only in git history after this. Citation scrub is queued for the docs
> session.

> **Scope amendment (Ford-approved):** the session plan said "no refactors
> beyond what a move mechanically requires." Part 2 includes **three declared
> refactors** (stage slot conversion, interaction types split, dispatcher
> relocation) needed to reach the vertical-slice tree. All are
> behavior-preserving and verified by the DOM-equivalence gate + the frozen
> failure set.

---

# Part 1 — repo root, tools/, to_add/

## Placement rules

- **R1 — Repo meta lives at root:** `README.md`, `LICENSE`, `PROVENANCE.md`,
  `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `happydom.ts`
  (preloaded by `bunfig.toml` via root-relative path), `.gitignore`,
  `.gitmodules`, `.claude/`.
- **R2 — Path-anchored corpora live at root:** `canvases/` (hard-coded by
  studio `vite.config.ts`, the DOM-equivalence harness readdir, and ~12 test
  imports) and `board-design-reference/` (ground-truth analysis files cited
  from production source: `SelectionToolbar.tsx`, `CanvasDock.tsx`,
  `theme.ts`; plus many docs).
- **R3 — `tools/` holds ongoing repo tooling only:** generators and CLIs that
  are still invoked or still under test coverage. One-shot artifacts are
  deleted once applied — not archived in-tree.
- **R4 — Reference material lives in `board-design-reference/`:** measured
  specs, mockups, and source recordings that ground design decisions.
- **R5 — Active session plans live at root, transiently:** `LAYOUT-OVERHAUL.md`,
  `DOCS-OVERHAUL.md`, this file. Retired when their sessions land.
- **R6 — Superseded decision records are deleted, not archived:** once their
  content lives in `docs/`, planning/spec markdowns are removed (git history
  is the archive). Applied to `OBJECT-DEF-OVERHAUL.md` per Ford (see flag);
  dangling-citation scrub goes to the docs session.

## Move / delete / keep table

| # | Path | Action | Rule / evidence |
|---|------|--------|-----------------|
| 1 | `to_add/connector-stuff/` (12 CleanShot PNGs) | **delete** | Zero references; connector work shipped and documented |
| 2 | `to_add/black pop up/figjam-popup-animation.html` | **move** → `board-design-reference/analysis/` | R4. Live ground truth; 3 citations rewritten in the same commit (`editor-style.ts:43`, `.claude/launch.json:64`, `60-chrome/doc.json:1726`) |
| 3 | `to_add/black pop up/Figma Pop Up.mp4` | **delete** (per Ford) | Zero references; the measured HTML recipe supersedes it |
| 4 | `to_add/` | **delete** (emptied) | Session exit criterion |
| 5 | `tools/migrations/flatten-containers.ts` | **delete** | R3. One-shot, already applied, zero references |
| 6 | `tools/migrations/reconcile-membership.ts` | **delete** | R3. Never wired; runtime `section-membership.ts` owns the logic |
| 7 | `tools/palette-contact-sheet.ts` + `.html` | **delete** | R3. Self-described throwaway; checkpoint passed |
| 8 | `tools/migrate-canvas-docs/` | **keep** | R3. Live test imports 6 exports; 3 `doc.json` citations |
| 9 | `board-design-reference/my_diagrams/.DS_Store` | **delete** + gitignore `.DS_Store` | Junk |
| 10 | `PROVENANCE.md` | **keep at root** | R1. 5 vendored-file headers hard-code `../../../../PROVENANCE.md`; NOTICE says "repo's root" |
| 11 | `OBJECT-DEF-OVERHAUL.md` | **delete** (per Ford) | R6. Ford: docs cover it. ⚠ see flag — citation scrub → docs session |
| 12 | `happydom.ts` | **keep at root** | R1. `bunfig.toml` preload |
| 13 | `canvases/` (all 8 fixtures) | **keep at root** | R2. All 8 referenced (readdir baseline, studio vite plugin, validate-all test, 4 direct-import) |
| 14 | `board-design-reference/` | **keep at root** | R2/R4 |
| 15 | zz-dom gate quartet (`zz-dom-baseline.json`, `zz-dom-capture.ts`, `src/zz-dom-equivalence.test.tsx`, `src/zz-dom-fixtures.ts`) | **keep** | It IS this session's verification gate; retirement queued |
| 16 | `docs/` | **untouched** | Docs session owns it |

## Part 1 commit plan

1. `chore(layout): triage to_add — move popup reference into corpus, drop the rest` (items 1–4 + 3 citation rewrites)
2. `chore(layout): delete applied one-shot tooling from tools/` (items 5–7)
3. `chore(layout): retire OBJECT-DEF-OVERHAUL.md — superseded by docs/` (item 11)
4. `chore(layout): drop tracked .DS_Store and ignore OS junk` (item 9)

---

# Part 2 — `packages/canvas/src` restructure (vertical slices)

## The design, in one paragraph

The old tree split one pipeline across layer-named folders (`interaction/`,
`render/`, `editor/`), so every feature was smeared: the drag-select gesture
lived in one dir, its rectangle in another, its wiring in a third. The new
tree is organized by **what things are**: the theme, the document model, the
object kinds, a pointer-vocabulary kernel, the complete connector slice, and
a `stage/` display domain whose two faces — `viewer/` and `editor/` — are
nested inside it. Inside the editor, **every feature is a vertical slice**:
its gesture logic and its visuals live in one folder named after the
feature. The stage core draws documents, period — the viewer proves it by
construction; the editor injects all ephemeral visuals through the stage's
existing overlay slot.

## Target tree

```
packages/canvas/src/
├── index.ts                        # public barrel — exported SYMBOLS unchanged, paths rewritten
├── zz-dom-fixtures.ts / zz-dom-equivalence.test.tsx   # gate, untouched (import paths updated)
│
├── theme/                          # THE THEME (per Ford's naming)
│   ├── palette.ts                  #   ← src/palette.ts — the 10-pick color table + resolvers
│   └── tokens.ts                   #   ← src/theme.ts — surface vars, stroke width, text hierarchy
│
├── state/                          # THE DOCUMENT MODEL (unchanged shape; frozen barrels stay)
│   ├── schema.ts, schema/          #   connections.ts gains `type Anchor` (from routing)
│   ├── actions.ts, actions/
│   ├── geometry.ts, section-membership.ts, z-order.ts
│   └── __tests__/                  #   + waypoint-reconcile.test.ts moves in from routing
│
├── objects/                        # OBJECT DEFINITIONS (unchanged, minus connector/)
│
├── interaction/                    # THE POINTER KERNEL (pure TS; shrinks — gestures leave)
│   ├── types.ts                    #   pointer/hit vocabulary + thresholds ONLY
│   │                               #   (gesture-state union moves up to stage/editor/pipeline)
│   ├── hit-testing.ts, frame-coalescer.ts, edge-pan.ts, clipboard.ts
│   └── __tests__/
│
├── connectors/                     # THE COMPLETE CONNECTOR SLICE
│   ├── def.ts                      #   ← objects/connector/def.ts
│   ├── routing.ts                  #   ← routing/routing.ts (elbow/A* route engine)
│   ├── bend-editing.ts             #   ← routing/bend-editing.ts
│   ├── connection-cascade.ts       #   ← routing/connection-overlay.ts (renamed to what it does)
│   ├── gestures.ts                 #   ← interaction/gestures/connectors.ts
│   ├── types.ts                    #   connector drag-overlay + gesture-state types
│   ├── pathfinding/                #   ← src/vendor/blocksuite/ (absorbed; MPL headers kept)
│   │   └── path-generator.ts, a-star.ts, graph.ts, priority-queue.ts, gfx-types.ts
│   ├── Connector.tsx / ConnectorDragPreview.tsx / ConnectionLabelChip.tsx   # ← render/connectors/
│   ├── AnchorDots.tsx              #   ← render/overlays/ — it draws connection ports
│   └── __tests__/
│
├── stage/                          # THE DISPLAY DOMAIN (was render/, restructured)
│   ├── CanvasStage.tsx             #   draws the DOCUMENT only after the slot conversion;
│   ├── ObjectShape.tsx             #   all ephemeral visuals arrive via the overlay slots
│   ├── grid.ts, viewport.ts
│   ├── __tests__/
│   │
│   ├── viewer/                     # face 1: DISPLAY ONLY
│   │   └── InteractiveCanvasViewer.tsx   # ← editor/ — fit viewport + stage, no machine
│   │
│   └── editor/                     # face 2: EDITING — a layer on top of the stage core
│       ├── InteractiveCanvasEditor.tsx
│       ├── use-canvas-viewport.ts, use-canvas-hotkeys.ts
│       ├── pipeline/               #   the machine's ASSEMBLY
│       │   ├── core.ts             #     ← interaction/core.ts — dispatcher + gesture-state union
│       │   ├── use-interaction-pipeline.ts, use-hover-target.ts   # ← features/drag-pipeline/
│       │   ├── stage-dom.ts        #     ← editor/stage-dom.ts
│       │   └── InteractionFeedback.tsx   # NEW: renders slice visuals into the stage slot
│       ├── components/             #   RULE: stateless chrome widgets
│       │   └── CanvasDock, TopBar, ZoomControls, ColorPicker,
│       │       ShapesPanel, ShapeSearchPopover, shape-previews, editor-style
│       └── features/               #   RULE: vertical slices — behavior + visuals together
│           ├── selection/          #     drag-select.ts (← gestures/marquee.ts, renamed)
│           │                       #     DragSelectRect.tsx (← overlays/Marquee.tsx, renamed)
│           │                       #     SelectionBox.tsx, HoverHighlight.tsx (← overlays/)
│           │                       #     resize.ts (← gestures/resize.ts — handles ARE the box)
│           ├── move/               #     move.ts (← gestures/move.ts) + drop-target feedback
│           ├── place/              #     place.ts (← gestures/place.ts) + PlacePreview.tsx (← overlays/)
│           ├── snapping/           #     snapping.ts (← interaction/) + snap-distribution.ts (← vendor)
│           │                       #     SnapGuideLine, DistributionGuideLine, SpacingChips (← overlays/)
│           │                       #     [service slice: move/ may import its math]
│           ├── selection-toolbar/, context-menu/, text-editing/,
│           └── inspector/, section-fit/          # already slices — unchanged
│
└── ui/                             # GENERIC PRIMITIVES (unchanged: shadcn-derived + icons)
```

Gone as concepts: `render/` (→ `stage/`), `routing/` (→ `connectors/`),
`src/vendor/` (dissolved), `editor/features/drag-pipeline/` (→ `pipeline/`),
"marquee" (→ drag-select, including `MarqueeGesture` → `DragSelectGesture`,
`overlay.marquee` → `overlay.dragSelect`, the `"marquee"` state-kind string).

## Layer order (re-encoded in `import-boundaries.test.ts`)

```
ui ─┐                                                        ┌→ viewer
theme → state → objects → interaction (kernel) → connectors → stage core ┤
                                                                          └→ editor (pipeline + slices)
```

- Children may import parents, never the reverse: stage core must not import
  `stage/viewer/**` or `stage/editor/**`.
- Slices export a small surface; sideways slice imports only via declared
  service slices (today: `snapping`).
- The old whitelisted `routing→objects` inversion and the `state→routing`
  type edge both disappear (`connectors` sits above `objects`; `Anchor`
  lives in schema). The `interaction→render` ViewportState type edge
  dissolves during the types split (viewport-referencing context types move
  up to `pipeline/`, which sits above stage).

## The three declared refactors (everything else is moves + path rewrites)

1. **Stage slot conversion** — extract `CanvasStage`'s ~70 lines of
   overlay-mounting JSX into `stage/editor/pipeline/InteractionFeedback.tsx`,
   injected via the `overlay`/`worldOverlay` slots CanvasStage already has.
   `ConnectorDragPreview` moves to slot injection too (it's ephemeral);
   `Connector`/`ConnectionLabelChip` stay stage-mounted (document content).
2. **Interaction types split** — `interaction/types.ts` keeps only the
   pointer/hit vocabulary; each slice owns its gesture-state type; the
   `InteractionState` union + dispatcher assemble in `pipeline/core.ts`.
3. **Dispatcher relocation** — `interaction/core.ts` → `pipeline/core.ts`.

## Absorbed MPL files (license note)

The six BlockSuite-derived files are absorbed as first-party modules
(`connectors/pathfinding/`, `features/snapping/snap-distribution.ts`) — no
vendor directory, no vendor import rule, no origin naming anywhere in the
tree. MPL-2.0 is file-scoped: each file keeps its short MPL header comment,
the NOTICE text folds into `PROVENANCE.md` as a one-liner, and modified
versions of those files remain MPL-2.0. That is the full obligation.

## Blast radius / companion rewrites

| Change | Companion rewrites |
|---|---|
| All src moves | Internal import paths (Codex, mechanical); `index.ts` barrel paths — exported symbol set unchanged |
| `theme/` | `tools/migrate-canvas-docs/migrate.ts` (imports `src/palette`) |
| `connectors/` | drop dead `./connection-overlay` export from package.json (zero consumers found) |
| drag-select rename | symbol/test sweep (`MarqueeGesture`, `overlay.marquee`, `"marquee"` kind) |
| import-boundaries | full rewrite of expectations to the new layer + slice rules |
| Unaffected | `./schema` `./actions` `./geometry` `./ui/*` export paths (state/ and ui/ don't move); `tools/nucleo-icons` write paths (ui/icons/ and objects/ untouched); `bunfig.toml` root |

## Part 2 commit plan (each passes the full gate before the next)

5. `refactor(layout): move Anchor to schema; split interaction kernel vocabulary from the gesture union` (xhigh)
6. `refactor(layout): consolidate the connector slice` — routing/, render/connectors/, objects/connector, gestures, AnchorDots, pathfinding absorption, connection-cascade rename, dead export drop (xhigh)
7. `refactor(layout): stage slot conversion — CanvasStage draws the document; InteractionFeedback injects the rest` (xhigh)
8. `refactor(layout): nest the stage — render/→stage core, viewer/ + editor/ under it, pipeline promoted, dispatcher moved` (xhigh)
9. `refactor(layout): vertical feature slices — selection (drag-select rename), move, place, snapping` (xhigh)
10. `refactor(layout): theme/ — palette.ts + tokens.ts` (low)
11. `test(layout): re-encode the layer and slice rules in import-boundaries` (xhigh)
12. Freeze: update this file to as-executed state; session docs retire per plan.

---

## Deferred queue (do NOT reopen the tree this session)

- zz-dom gate retirement after the registry refactor validates (relocate
  `ALL_OBJECT_TYPES` out of `zz-dom-fixtures.ts` first — 3 real tests import it).
- Scrub the ~25 dangling `OBJECT-DEF-OVERHAUL.md` citations + ~10 stale
  `RESTRUCTURE.md` comment pointers — docs session. Verify D1–D19 rationale
  truly landed in `docs/`; recover from git history if gaps surface.
- `SELECTION_BLUE #0D99FF` + select-cursor SVG inlined in stage files to
  avoid importing editor style — fold into `theme/tokens.ts` in a future
  round (behavior-adjacent, not now).
- Git-LFS/external store for the ~13 MB of `.mp4` + heavy PNGs.
- Possible `state/` → `model/` rename — heavy churn, needs a trigger.

## Verification (phase 4, applies to both parts)

1. Pre-move failure set (captured): zz-dom-equivalence baseline, ObjectShape
   below-slot text, outline-anchor connection-cascade, 3× v2-flow JSON.
2. `bun run typecheck` both packages; `bun test packages/canvas/src` —
   failure set must be **identical**.
3. `bun test zz-dom` — the DOM gate: moves AND the three declared refactors
   must not change rendered DOM; baselines never regenerated.
4. `bun run dev:studio` boots and renders a fixture.

---

# As executed (2026-07-09)

Commits: `461a0a4` `1172162` `7490d4a` `08c9be9` (Part 1) · `d3f1994`
`d27866a` `145a0be` `7c0b4c9` `fdab331` `9756bc3` `20b19fe` (Part 2) ·
`1abd832` (docs initial pass) · + freeze commit.

## Deviations from the plan

- **Codex/git division of labor:** Codex's sandbox protects `.git`, so every
  commit ran as "Codex edits files → orchestrator stages scoped paths and
  commits." Also: headless `codex exec` must run with stdin redirected from
  /dev/null or it hangs waiting on the pipe.
- **Commit 7 needed a follow-up:** 21 unit tests mounted CanvasStage the old
  way; migrated to the new slot composition via a shared helper
  (`stage/__tests__/canvas-stage-test-utils.tsx`), assertions untouched.
  `zz-dom-fixtures.ts` gained an import-boundary exemption (composition
  harness, retirement queued).
- **Commit 11 extras:** renamed `connection-overlay.test.ts` →
  `connection-cascade.test.ts` and `astar-vendor.test.ts` →
  `pathfinding-astar.test.ts`.
- **Docs initial pass ran in this session** (per Ford) rather than waiting
  for the docs session: all 14 doc.json files re-pointed at the new tree;
  narrative rewrites deliberately NOT done.
- **PROVENANCE.md**: gained the MPL file-level compliance section (ex
  NOTICE); fixed a stale snap-distribution path and a doubled-path typo.
- Header blurbs added to moved/created files per Ford's request.

## Boundary-test reality gaps (encoded as TODO(layout): tighten)

1. `theme/palette.ts` runtime-imports `CANVAS_COLORS` from state.
2. `objects/` imports `connectors/def` from two files.
3. `connectors/AnchorDots.tsx` + `ConnectorDragPreview.tsx` import stage core.
4. `stage/viewer/` imports the editor's InteractionFeedback (read-only
   selection box path — also a design question: should the viewer show a
   selection box at all?).
5. `context-menu`/`inspector`/`selection-toolbar` slices import `section-fit`.

## Additional deferred-queue items discovered during execution

- **Docs-session worklist (from the four docs agents' reports):** narrative
  mismatches in 40-render (pre-slot-conversion framing), 50-editor (no
  pipeline/ story, viewer location), 20-interaction (monolithic-layer
  narrative), 70-studio (localStorage story is stale — the app now uses
  /api/canvases; sample list still describes TS modules); pre-existing
  citation drift in 10-model (~28 refs to deleted state/actions/defaults.ts,
  16 outline-geometry symbols cited in the wrong file), stale SpectreRef
  paragraph in 99-appendix; docs directory names (30-routing, 40-render,
  50-editor) still carry old layer names.
- interaction/interaction.ts barrel: reassess whether it still earns its
  keep now that the kernel is small.

## Post-freeze amendments

- 2026-07-09: `objects/object-chrome.tsx` → `objects/object-shell.tsx`
  (`ObjectButtonChrome` → `ObjectShell`), per Ford — "chrome" is now reserved
  for editor UI. Full gates held.
