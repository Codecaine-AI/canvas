# FigJam Parity — Gap Analysis & Build Plan

> Synthesized from: `figjam-chrome-catalog.md`, `figjam-bottom-dock-spec.md`,
> `figjam-style-spec.md` + `figjam-style-tokens.json`, `affine-mining-map.md`.
> Acceptance gate: recreate `my_diagrams/V2 Flow.png` in our editor — indistinguishable
> side-by-side, with the same build ergonomics. Fidelity decision: pixel-close clone.

## Gap analysis (ours today → FigJam target)

| Area | We have | Gap |
|---|---|---|
| Canvas | OKLCH theme bg, density-stepped dot grid | `#F5F5F5` board, adaptive grid: base 8px × powers of 2 (screen spacing held ~6.5–13px), ~2px `rgba(0,0,0,0.13)` dots |
| Font | System/theme font | Inter for all canvas content; FigJam sizes (chip 16, sticky 24/36lh, author 12@40%, bold label 20, shape 15) |
| Sections | `container` (border-band drag, no tint/chip) | New `section` type: tint families + title chip (fill/border/label triples), capture-by-overlap, **moves contents on drag** (FigJam semantics — AFFiNE's frame model is scaffolding only), layering props, corners-only selection |
| Shapes | rect, diamond, text, document, person, database, chat, note | FigJam catalog subset for V2 Flow: pill/stadium, chevron/arrow shape, predefined-process (inner bars), icon shapes (chat/person/CPU as FigJam draws them), code block (Dracula + line numbers), standalone bold label; sticky upgrade (square corners, `#FFE299`+family, measured shadow, author chip 12px @40%) |
| Connectors | A* elbow (vendored), rounded turns, labels, arrowheads | 4px `#757575` chunky default, color set (orange/green/red/gray), elbow radius ~21.5 logical, **8–12px end gaps**, arrowhead 5× stroke, dash `[12,12]`, endpoint circles, bend hover affordance |
| Connect UX | quick-connect edge ports (M1) | AFFiNE ConnectionOverlay port: anchors projected on actual outline, 8px snap, outline fallback, relative `[0..1,0..1]` endpoints (schema already has `position`) |
| Snap | closest-wins guides + correction | AFFiNE snap-overlay port: snap INTO equal spacing, chained gap guides (`ALIGN_THRESHOLD=8/zoom`, guide colors `#8B5CF6`/`#CC4187`) |
| Dock | dark icon row, unlabeled | White stadium 462×37 r≈18.5 `#FDFDFD`, 13 buttons/5 whitespace groups, hover-gray/active-violet, modal highlight rule |
| Context toolbar | inspector panel only | Floating dark `#1D1D1D` pill per type (shape/section/connector/text variants, measured control sets), 27–28px above selection, viewport edge-clamping, 2×11 palette popover, tooltips |
| Shape pickers | none | Floating "Search for a shape" popover + left-docked Shapes panel (sectioned catalog) |
| Right-click | M1 context menu | FigJam menu contents + shortcuts |
| Misc | read-only preview trap on /canvas | preview trap fix; text-edit caret flow + font-preset menu (Simple=Inter live; Bookish/Technical/Scribbled shells later); text sizes S/M/L; bullets in stickies |

## Build waves (merge-surface-aware)

**W1-visual** *(small, first, unblocks everything)*: `figjam-tokens.ts` from the tokens JSON;
canvas bg + adaptive grid (replace density-stepping with FigJam's 8×2^n law); connector
visual defaults (stroke 4, #757575, arrowheads 5×, end gaps 8–12, radius 21.5, dash 12/12);
Inter font wiring for canvas content. Files: theme/grid/routing render constants,
CanvasStage background block.

**W2-model** *(the big one, after W1 commits)*: `section` type (capture + move-children +
chip + tints + layering) + shape vocabulary expansion (pill, chevron-arrow,
predefined-process, icon shapes, code block, label; sticky upgrade w/ author + shadow) +
tools/placement + renderers. Files: schema/actions/interaction/CanvasStage/editor.
∥ **W2-chrome-components** *(parallel, standalone)*: dock, contextual toolbar variants,
palette popover, shape-search popover, Shapes panel, tooltips — as unwired components with
tests (no editor edits → no conflicts).

**W3-wire + feel**: wire chrome into the editor (replace old toolbar/inspector affordances);
ConnectionOverlay port; snap-overlay port; right-click menu contents; preview-trap fix;
text-edit caret/font-preset/sizes/bullets.

**W4-acceptance**: recreate V2 Flow as a board fixture; side-by-side vs the PNG; iterate
until indistinguishable; feel pass (build a section of it by hand); full suites green.

Open items needing live-FigJam ground truth (implement from known behavior, flag for user
QA): section drag capture edge cases, hover-port timing, resize modifiers, shape
right-click contents.
