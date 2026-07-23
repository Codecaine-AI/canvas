# @codecaine-ai/canvas-agent

The canvas's agent layer. Its first capability is layout: an AI loop that
rearranges a scoped part of a whiteboard on request, proposing patch
operations the editor applies as one undoable step.

Three parts, one package:

- **`src/pipeline/`** — pure, deterministic layout math (no React, no IO, no
  kernel imports): fit a document into a layout program, parse/serialize the
  program, expand it back into geometry, route connectors, plus scoped fit,
  program diff → patch ops, lint, and the occupancy ASCII view. This is the
  package's `.` export; tests and the docs-board generator use only this half.
- **`src/harness/`** — the Bun-only Agent Kernel harness (`@agent-kernel/*`,
  Pi Agent SDK): the kernel instance, the layout session store, the five
  layout tools, the draft renderer (SVG → PNG via resvg), and the HTTP
  surface on **:4820**. Studio proxies `/api/canvases/:id/agent/*` and
  `/api/agent/*` here, so the browser only ever talks to the studio origin.
- **`src/viewer/`** — the standalone operator viewer: a small Vite React app
  on **:4830** (traces, session detail, agent config + prompt lab), built on
  `@agent-kernel/viewer-{core,ui,shell}` + `@codecaine-ai/prompt-kit`. Its
  dev proxy pipes `/api/*` to the harness; it runs in its own browser
  window, side-by-side with studio.

The wire types shared with studio live in `src/protocol.ts`
(`@codecaine-ai/canvas-agent/protocol` — types only).

## Running

```sh
make harness                  # from the repo root (or: bun run dev:harness)
```

## Trace viewer

```sh
make traces                   # from the repo root
```

Boots the harness on :4820 if one isn't already answering `/health`, starts
the viewer on **http://localhost:4830**, and (on macOS) opens it in its own
browser window. Or run the viewer alone: `bun run dev:agent-viewer` from the
repo root (`bun run viewer` from this package). Three views: `/traces`
(session list + live trace viewer), `/session?id=…` (one session's detail),
`/config` (manifest + prompt lab). If the harness is down the pages show a
calm "agent service is not running" state — nothing is broken.

Model access goes through the local models process (the `codex-lb` provider in
repo-root `.pi-agent/models.json`); no provider keys, no login flow. Kernel
runtime state (trace.db, Pi session transcripts, layout session dirs) lives in
repo-root `.agent-kernel/`. Both directories are gitignored.

## Headless CLI

Run a full layout session against a real board without studio:

```sh
cd packages/canvas-agent
bun run cli --list-scopes agent-flows-2            # pick a scope
bun run cli --canvas agent-flows-2 \
  --scope box-1,box-2,box-3 \
  --instruction "line these up and even out the spacing"
```

The CLI streams the fitted program, per-proposal delta + lint reports, and
the final patch operations to stdout; every `render_draft` image is written
to `.agent-kernel/cli-renders/` (override with `--out-dir`).

## Prompts

The layout agent is a catalog bundle at
`src/harness/agent-catalog/layout-editor/` — `agent.json` (manifest),
`prompt.json` (the canonical prompt document), `prompt.rendered.md` (derived
snapshot; never hand-edit), with `context.ts`/`tools.ts` code sidecars.
Prompt edits go through the kernel catalog API (the viewer's `/config` page,
`make traces`), which re-canonicalizes, regenerates the rendered snapshot,
and records the new promptHash — every kernel session records the promptHash
it ran with, so traces always say which prompt produced which behavior.
