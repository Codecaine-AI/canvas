# Provenance

`@codecaine-ai/canvas` and its `board-design-reference/` design corpus were
extracted from the Spectre monorepo at commit `321ce699e695464bc6f44310744e870e495185be`
("figjam-w5: connection waypoints follow moved objects (rigid translate /
asymmetric re-route)"), on 2026-07-05.

## What moved

- `apps/frontend/src/lib/interactive-canvas/**` (the engine, chrome
  components, sample canvas data, and test suite) → `packages/canvas/src/**`, with two
  exceptions that stayed in Spectre because they are app-coupled
  (`CanvasSidecarEmbed.tsx` imports Spectre's `@/lib/projects-api`;
  `InteractiveCanvasLibrary.tsx` + its `/canvas` route are the Spectre docs
  app's library page). Their two dedicated test files
  (`CanvasSidecarEmbed.test.tsx`, `library-page.test.tsx`) stayed in Spectre
  alongside them.
- `apps/frontend/src/lib/vendor/blocksuite/{a-star,graph,priority-queue,
  gfx-types,path-generator,snap-distribution}.ts` → `packages/canvas/src/vendor/blocksuite/`,
  each still carrying its original BlockSuite (MPL-2.0) provenance header.
  `slash-menu-model.ts` (also vendored from BlockSuite, but backing
  Spectre's docs editor slash menu, not the canvas engine) stayed in
  Spectre. See `packages/canvas/src/vendor/blocksuite/NOTICE` here and
  `apps/frontend/src/lib/vendor/blocksuite/NOTICE` in Spectre for the split
  provenance records.
- `board-design-reference/` (FigJam/AFFiNE reference recordings, pixel
  analysis, and design diagrams used to build the engine's visual parity)
  moved from the Spectre repo root to `packages/canvas/board-design-reference/`
  verbatim — it is canvas design material, not general repo documentation.

## What was vendored in (new, not from Spectre's canvas code)

A handful of Spectre's shadcn-style UI primitives and its `cn()` class-name
helper were duplicated (not re-exported) into `packages/canvas/packages/canvas/src/ui/`
so the package has zero dependency on a host app's component library:
`Button`, `Input`, `Textarea`, `Badge`, and `cn`. These are trimmed copies of
Spectre's `apps/frontend/src/components/ui/{button,input,textarea,badge}.tsx`
and `apps/frontend/src/lib/utils.ts` (`cn` export only). `SpectreRef` (the
doc/canvas shared reference-link type) was similarly copied as a
type-only local file (`src/spectre-ref.ts`) rather than depending on
Spectre's `docs-model` package — the runtime `validateSpectreRef` validator
was intentionally left behind since only the type is needed here.

`lucide-react` moved from an app dependency to a direct dependency of
`@codecaine-ai/canvas`.

## Licensing note

This package inherits the same open questions as the pre-extraction code:
the `vendor/blocksuite/` subdirectory contains MPL-2.0-licensed ports and
verbatim copies from BlockSuite (https://github.com/toeverything/blocksuite).
MPL-2.0 is a file-level copyleft license — see
`packages/canvas/packages/canvas/src/vendor/blocksuite/NOTICE` for the exact
provenance and modification status of each vendored file, and keep that
NOTICE in sync if those files are ever modified. The rest of this package
(the engine, chrome components, sample canvas data, and vendored UI primitives) is
original Spectre/Codecaine code with no further licensing constraints beyond
whatever license this repository declares at large.

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
