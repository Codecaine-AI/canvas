# Codecaine Canvas

FigJam-grade interactive canvas: a typed-action world-space engine
(`@codecaine-ai/canvas`) plus a standalone studio UI (`@codecaine-ai/studio`)
for creating and editing boards without a host app.

Extracted from the Spectre monorepo (see PROVENANCE.md). Part of the
Codecaine suite alongside pi-agent-kernel and docs-framework.

## Layout

```
packages/
  canvas/     @codecaine-ai/canvas — the engine (schema, actions, geometry,
              interaction state machine, rendering, trim components).
              See packages/canvas/src/index.ts for the barrel and
              docs/00-overview.md for the architecture map.
  studio/     @codecaine-ai/studio — a minimal standalone Vite+React app
              for creating/editing boards without a host app.
canvases/     Studio-backed `.canvas.json` boards and sample documents.
docs/         00-overview.md — engine architecture, one page.
board-design-reference/
              FigJam/AFFiNE reference recordings + pixel-sampled style
              analysis the engine's visual constants are derived from.
```

## Getting started

```bash
bun install
bun test packages/canvas/src   # engine test suite
bun run dev:studio             # standalone board editor, http://localhost:3999
make studio                    # build and open the Mac Electron app
```

See `PROVENANCE.md` for what was extracted from Spectre and the BlockSuite
(MPL-2.0) vendoring/licensing notes.

## License

MIT — see `LICENSE`.

The files under `packages/canvas/src/vendor/blocksuite/` are vendored from
BlockSuite and remain under the MPL-2.0; see that directory's `NOTICE`.
