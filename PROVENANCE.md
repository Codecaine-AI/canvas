# Provenance

`@codecaine-ai/canvas` and its `board-design-reference/` design corpus were
extracted from the Spectre monorepo at commit `321ce699e695464bc6f44310744e870e495185be`
("figjam-w5: connection waypoints follow moved objects (rigid translate /
asymmetric re-route)"), on 2026-07-05.

## What moved

- `apps/frontend/src/lib/interactive-canvas/**` (the engine, trim
  components, sample canvas data, and test suite) → `packages/canvas/src/**`, with two
  exceptions that stayed in Spectre because they are app-coupled
  (`CanvasSidecarEmbed.tsx` imports Spectre's `@/lib/projects-api`;
  `InteractiveCanvasLibrary.tsx` + its `/canvas` route are the Spectre docs
  app's library page). Their two dedicated test files
  (`CanvasSidecarEmbed.test.tsx`, `library-page.test.tsx`) stayed in Spectre
  alongside them.
- `apps/frontend/src/lib/vendor/blocksuite/{a-star,graph,priority-queue,
  gfx-types,path-generator,snap-distribution}.ts` moved into the canvas
  package and now live at `packages/canvas/src/connectors/pathfinding/`
  (`a-star`, `graph`, `priority-queue`, `gfx-types`, `path-generator`) and
  `packages/canvas/src/stage/editor/features/snapping/snap-distribution.ts`. Each still carries
  its original BlockSuite (MPL-2.0) provenance header. `slash-menu-model.ts`
  (also vendored from BlockSuite, but backing Spectre's docs editor slash
  menu, not the canvas engine) stayed in Spectre. See the BlockSuite MPL
  provenance section at the end of this file and
  `apps/frontend/src/lib/vendor/blocksuite/NOTICE` in Spectre for the split
  provenance records.
- `board-design-reference/` (FigJam/AFFiNE reference recordings, pixel
  analysis, and design diagrams used to build the engine's visual parity)
  moved from the Spectre repo root to `packages/canvas/board-design-reference/`
  verbatim — it is canvas design material, not general repo documentation.

## What was vendored in (new, not from Spectre's canvas code)

A handful of Spectre's shadcn-style UI primitives and its `cn()` class-name
helper were duplicated (not re-exported) into `packages/canvas/src/ui/`
so the package has zero dependency on a host app's component library:
`Button`, `Input`, `Textarea`, `Badge`, `Tooltip`, and `cn`. These are trimmed
copies of Spectre's `apps/frontend/src/components/ui/{button,input,textarea,badge}.tsx`
and `apps/frontend/src/lib/utils.ts` (`cn` export only), plus the local canvas
trim tooltip primitive. The type-only `SpectreRef` copy vendored for
code-block references was removed with the code-block object kind on
2026-07-09.

`lucide-react` moved from an app dependency to a direct dependency of
`@codecaine-ai/canvas` at extraction time. It has since been removed
entirely: all icons are now generated from the user's licensed Nucleo SVG
set. The canonical library lives outside the repo (the user's Dropbox Nucleo
sets); icons are discovered by grepping it. The icon selection/mapping is in
`packages/canvas/src/ui/icons/manifest.json`, and the generator in
`tools/nucleo-icons/generate.ts` resolves each manifest source against that
library and vendors only the SVGs actually used into
`packages/canvas/src/ui/icons/nucleo/svg/` (so CI and library-less machines
regenerate identically). It outputs one component per file under
`packages/canvas/src/ui/icons/nucleo/` (plus a generated `index.ts` barrel)
and emits canvas-object glyph data to
`packages/canvas/src/objects/shapes/icon/icon-glyph-data.generated.ts`.

## Licensing note

This package inherits the same open questions as the pre-extraction code:
several connector pathfinding, cascade, outline-anchor, and snap-distribution
files are MPL-2.0-licensed ports or verbatim copies from BlockSuite
(https://github.com/toeverything/blocksuite). MPL-2.0 is a file-level
copyleft license; see the BlockSuite MPL provenance section below for the
exact provenance and modification status of each file, and keep it in sync if
those files are ever modified. The rest of this package (the engine, trim
components, sample canvas data, and vendored UI primitives) is original
Spectre/Codecaine code with no further licensing constraints beyond whatever
license this repository declares at large.

## Repo layout at extraction time

```
packages/canvas/                 (this repo's root)
  PROVENANCE.md                  (this file)
  README.md
  package.json                   (workspace root: "packages/*")
  tsconfig.json
  docs/00-overview.md
  board-design-reference/        (moved verbatim from Spectre root)
  packages/
    canvas/                      (@codecaine-ai/canvas — the engine)
    studio/                      (@codecaine-ai/studio — standalone board editor)
```

## BlockSuite MPL provenance

The files listed below are copied or ported from BlockSuite
(https://github.com/toeverything/blocksuite) under MPL-2.0. This section
absorbs the former `packages/canvas/src/vendor/blocksuite/NOTICE` content.

- `packages/affine/blocks/surface/src/utils/priority-queue.ts`
  -> `packages/canvas/src/connectors/pathfinding/priority-queue.ts`
  (verbatim, MPL-2.0 header added).

- `packages/affine/blocks/surface/src/utils/graph.ts`
  -> `packages/canvas/src/connectors/pathfinding/graph.ts`
  (import paths adjusted to local `gfx-types.ts`; algorithm body unmodified).

- `packages/affine/blocks/surface/src/utils/a-star.ts`
  -> `packages/canvas/src/connectors/pathfinding/a-star.ts`
  (import paths adjusted to local `graph.ts`, `priority-queue.ts`, and
  `gfx-types.ts`; algorithm body unmodified).

- `packages/affine/gfx/connector/src/connector-manager.ts`
  -> `packages/canvas/src/connectors/pathfinding/path-generator.ts`
  (not verbatim: extracts the pure orthogonal path-generation logic and ports
  it to plain TypeScript types, removing Lit, signals, BlockSuite controller
  dependencies, model dependencies, and rendering/overlay code).

- BlockSuite `@blocksuite/global/gfx` primitives
  -> `packages/canvas/src/connectors/pathfinding/gfx-types.ts`
  (dependency-free reimplementation of the handful of gfx primitives needed by
  the pathfinding files: `IVec`, `IVec3`, `Bound`, `Vec`, `PointLocation`,
  `almostEqual`, `isOverlap`, `lineIntersects`, and
  `linePolygonIntersects`).

- `packages/affine/gfx/pointer/src/snap/snap-overlay.ts`
  -> `packages/canvas/src/stage/editor/features/snapping/snap-distribution.ts`
  (not verbatim: extracts equal-spacing distribution snap search and 9-way
  closest-alignment-distance search as plain functions. One documented
  deviation remains: `alignDistributeVertically` fixes two apparent upstream
  axis bugs; every other branch/formula is unchanged from upstream).

- `packages/affine/gfx/connector/src/connector-manager.ts` (`getAnchors`,
  lines 133-159, and `ConnectionOverlay.renderConnector`, lines 958-1061)
  -> `packages/canvas/src/objects/geometry.ts` and
  `packages/canvas/src/connectors/connection-cascade.ts`
  (not verbatim: algorithm-only ports. `getAnchors` is reproduced as
  `getConnectionAnchors`; the render connector decision cascade is reproduced
  as `resolveConnectionCascade`; canvas-paint/controller code is omitted).

MPL-2.0 compliance is tracked at file level: each copied or ported file carries
a header citing its upstream source path and license. Do not modify the copied
algorithm bodies in `priority-queue.ts`, `graph.ts`, `a-star.ts`,
`path-generator.ts`, `snap-distribution.ts`, `objects/geometry.ts`, or
`connectors/connection-cascade.ts` without updating this section and the file
headers accordingly.
