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

## Running the layout agent

The canvas-agent harness is a sibling Bun service on `127.0.0.1:4820`; the
operator viewer (traces + prompt config) runs on `:4830`. Kernel runtime
state lives in the gitignored `.agent-kernel/` directory.

```bash
make harness                   # agent service alone, foreground (:4820)
make traces                    # harness (if needed) + operator viewer (:4830)
bun run dev:harness            # the script under make harness
bun run dev:agent-viewer       # the viewer alone

# headless session against a saved board, no studio needed
bun run --cwd packages/canvas-agent cli --list-scopes <canvas-id>
bun run --cwd packages/canvas-agent cli --canvas <id> --scope <id,id,…> \
  --instruction "…" [--out-dir <dir>]
```

`make studio` starts the harness alongside the Mac app automatically.

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
