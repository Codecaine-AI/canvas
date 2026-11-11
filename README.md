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
  canvas-mcp/ @codecaine-ai/canvas-mcp — the MCP server agents edit boards
              through. It serves its own guidance topics.
canvases/     Studio-backed `.canvas.json` boards and sample documents.
docs/         00-overview.md — engine architecture, one page.
board-design-reference/
              FigJam/AFFiNE reference recordings + pixel-sampled style
              analysis the engine's visual constants are derived from.
```

## Getting started

Submodule setup is one level at a time — never `--recursive` (the
docs-framework/canvas embedding is circular, so a recursive init loops):

```bash
git submodule update --init tools/docs-framework
git -C tools/docs-framework submodule update --init packages/canvas
bun install
bun test packages/canvas/src   # engine test suite
bun run dev:studio             # standalone board editor, http://localhost:3999
make studio                    # build and open the Mac Electron app
```

## Editing boards from an agent

Agents edit boards through the canvas MCP server (`packages/canvas-mcp`),
which serves the layout toolkit from `@codecaine-ai/canvas/toolkit` and the
guidance topics from `@codecaine-ai/canvas/authoring`. An agent calls
`canvas_capabilities` first and reads topic `workflow` before its first edit.

```bash
bun packages/canvas-mcp/src/cli.ts mcp               # stdio MCP server
bun packages/canvas-mcp/src/cli.ts instructions       # the MCP prompt block
```

See `PROVENANCE.md` for what was extracted from Spectre and the BlockSuite
(MPL-2.0) vendoring/licensing notes.

## License

MIT — see `LICENSE`.

The files under `packages/canvas/src/vendor/blocksuite/` are vendored from
BlockSuite and remain under the MPL-2.0; see that directory's `NOTICE`.

Canvas icon glyphs generated from `tools/dev-icons/vendor/` come from Tabler
Icons (MIT) and Simple Icons (CC0, except three logos with their own licenses;
the logos are trademarks of their owners). See
`tools/dev-icons/THIRD-PARTY-NOTICES.md`.
