# Layout harness — setup plan

Status: **plan for sign-off — no implementation yet.**
Companion to KERNEL-PROPOSAL.md; this settles the things §2.1 and §7 left to
harness setup, against agent-kernel's actual docs and code (surveyed
2026-07-20: README, 10-runtime-model, 15-identity-model, 50-app-adapter-model,
20-implementation/70-app-adapters/10-application-setup, and the
simple-research-kernel example).

---

## 0. Facts found that shape the plan

- **The kernel only runs under Bun.** `@agent-kernel/db` imports `bun:sqlite`
  directly, and every `@agent-kernel/*` package ships raw TypeScript
  (`"main": "src/index.ts"`). Studio's Vite dev server happens to run under
  Bun (`bunx --bun vite`), but the Electron packaged server is plain Node —
  so a harness living inside studio's server process works in dev and is a
  dead end for the packaged app.
- **The reference harness is a sibling Bun service.** The
  simple-research-kernel example is an Elysia app on Bun: opens
  `.agent-kernel/trace.db` (WAL), ensures schema, writes a kernel manifest,
  builds the kernel, mounts the read API. That is the template to follow.
- **Tools register per-agent, not per-kernel.** An agent is a catalog
  directory (`agent.json` + `prompt.json` + optional `context.ts`/`tools.ts`
  sidecars). Private tools live in the agent's `tools.ts` via
  `defineTools((pi, runtime) => { pi.registerTool(...) })`; the kernel binds
  the config `toolRuntime` handle to the sidecar at spawn, and the registry
  harvests tool names into the allowlist at boot. Our five tools are exactly
  this shape.
- **Identity maps cleanly.** Container `kind: "layout-session"`,
  `key: [canvasId, sessionId]`. One kernel agent session per layout session —
  which is precisely why "refine = follow-up into the same session" is free:
  each instruction is a new *run* (`trigger: "operator"`, or `"steer"` while
  the loop is mid-flight) on the same Pi session, draft and conversation
  intact.
- **Correction to the proposal:** `canvasDocumentToOccupancyAscii` does not
  exist. What exists is `buildOccupancyGrid` in
  `apps/layout-lab/src/agent/occupancy.ts`. The ASCII serializer for the
  `inspect` tool is a small new function on top of the grid, not a reuse.
- Two smaller confirmations: `CanvasAgentPatchOperation`
  (`packages/canvas/src/state/actions/types.ts:76`) has no `removeObject` /
  `removeConnection` members yet (D1 needs them), and the editor exposes no
  imperative handle today — `document` is initial-state only, changes flow
  out through `onDocumentChange`. Selection never leaves the React tree, so
  the invoke payload must carry it.

---

## 1. Topology (settles §2.1's open question)

Two separate axes, decided differently (2026-07-20):

- **Product placement — revised 2026-07-20 (Ford), superseding the original
  "everything is studio UI" call:** the *invoke* side (asking the agent to
  work on a canvas, previews, accept/refine/reject) stays a first-class
  studio feature. The *operator* side — reading traces, inspecting context
  resolution, editing the agent's prompts — is a standalone viewer app owned
  by `packages/canvas-agent` (`src/viewer/`, port 4830, `make traces`),
  launched in its own browser window for side-by-side use. See §2b.
- **Process placement: the kernel runtime runs in a sibling Bun process.**
  This is invisible plumbing, forced by the facts in §0 (`bun:sqlite`,
  TS-source packages, Node Electron server). Studio's browser code never
  knows; it talks to its own origin and the proxy does the rest.

The split is workable because agent-kernel's UI packages
(`@agent-kernel/viewer-shell`, `viewer-ui`, `viewer-core`,
`@codecaine-ai/prompt-kit`) are browser-side React that consume the kernel
**read API over HTTP** — no Bun requirement. The standalone viewer app
imports those directly and mounts them; only `@agent-kernel/kernel` and
`@agent-kernel/db` are Bun-only, and only the harness imports them.

**The harness is a sibling Bun service** — the `src/harness/` half of
`packages/canvas-agent` (see §2), with its own server entrypoint, run as its own
process (dev: `bun run dev:harness`, port **4820**; a `make harness` target
to match the house style). Studio **fronts** it: `canvas-file-api.ts` gains a
proxy branch that pipes `/api/canvases/:id/agent/*` to
`http://127.0.0.1:4820`, streaming (SSE passes through untouched). Because
that handler is mounted identically in Vite dev and Electron, the browser
only ever talks to the studio origin in both worlds, and the harness process
is the same either way.

Why not in-process, beyond the Bun facts above: the Pi loop's lifetime
shouldn't be tied to Vite restarts (a config-file HMR reload would kill live
sessions), and the model API key stays out of the web-server process.

Document access: both processes share the repo filesystem. The harness reads
canvases from the same `canvases/` dir **read-only** — it never writes a
canvas file. Apply happens only through the editor (§2.4 of the proposal);
the harness's output is `CanvasAgentPatchOperation[]` handed back over the
session API.

Kernel packages are linked from the sibling checkout during active
development, per the app-adapter guide's dev posture:

```json
"@agent-kernel/kernel":   "link:../../../agent-kernel/packages/kernel",
"@agent-kernel/db":       "link:../../../agent-kernel/packages/db",
"@agent-kernel/protocol": "link:../../../agent-kernel/packages/protocol"
```

(Machine-local by design; if this needs to be portable later, the sanctioned
move is a submodule à la `tools/docs-framework` and a workspace glob. Not
now.) Trace DB and pi-sessions live in repo-root `.agent-kernel/`
(gitignored), kernel id `canvas-agent`.

## 2. Package layout after the two prerequisites

Simplified 2026-07-20: **one package for the whole agent layer —
`packages/canvas-agent`, the canvas's agent — and layout-lab is deleted.**
The name is deliberate: the package is not layout math with a server
attached, it is the agent layer for the canvas, whose *first capability* is
layout. `agent-catalog/layout-editor/` is the first agent in the catalog;
future capabilities (content editing, board critique) are new catalog
entries in the same package, no renaming. The pipeline and the harness never ship separately
— nothing ever needs the harness without the pipeline, and the pipeline's
only non-harness consumer (the docs-board generator) moves into the package
as its own script. The pure/runtime boundary survives as a *subdirectory*
rule instead of a package boundary.

```
packages/canvas-agent            @codecaine-ai/canvas-agent — the whole agent layer
  src/pipeline/            PURE: no React, no IO, no kernel imports
    fit / serialize / expand / route / metrics   (from layout-lab/src/sketch)
    units / router / occupancy                   (from layout-lab/src/agent)
    occupancy-ascii  NEW     scope  NEW (rings 0/1/2, boundary quoted-ids)
    diff  NEW (→ CanvasAgentPatchOperation[], replaces mapping/to-canvas.ts)
    lint  NEW (ladder, off-grid, crossings, overflow)
  src/harness/             Bun-only: imports pipeline + @agent-kernel/*
    server / kernel / session-store / render / routes / loaders
    agent-catalog/layout-editor/  (agent.json, prompt.json, tools.ts)
  src/cli.ts               headless driver
  src/viewer/              standalone operator viewer (Vite React on :4830) — §2b
  scripts/generate-docs-boards.ts   moved from layout-lab; same command, same output
  assets/boards/*.dsl               moved from layout-lab/assets/canvases
  assets/fonts/                     Inter for resvg
  test/                    round-trip, no-crossing, scope, diff — corpus
                           fixtures lifted from the lab's examples

packages/canvas            gains: applyAgentPatch action, remove* patch ops,
                           arbitrary-rect render crop, editor imperative handle
packages/studio            gains: agent proxy branch in canvas-file-api.ts;
                           the invoke/preview/accept UX on the canvas (phase 4);
                           the dev rail (§2b). 2026-07-20: the operator pages
                             and the viewer deps moved OUT of studio into
                             canvas-agent's src/viewer/ — studio ends with
                             zero @agent-kernel/* / prompt-kit deps
apps/layout-lab            DELETED in phase 1 — superseded by
                           docs/30-agent-layout (reference) and the studio
                           agent surface (interaction)
```

The import rule inside the package: `pipeline/` never imports `harness/` or
any `@agent-kernel/*`. The package's `.` export exposes pipeline only, so
consumers that just want the math (the docs-board script, tests) never load
Bun-only code; the harness runs via its own entrypoint. If a genuine reason
to split ever appears, the boundary is already a directory — it's a `git mv`.

**Studio does import canvas-agent — the pure part.** A types-only
`src/protocol.ts` (exported as `@codecaine-ai/canvas-agent/protocol`)
defines the session DTOs, SSE event shapes, and delta-report structure; the
harness routes and studio's client both import it, so the wire format has
one source of truth. Studio may also use pipeline exports (all browser-safe).
What studio never imports is `harness/` — that's Bun-only and reached over
HTTP. All *rendering* of the agent (chat window, session stream, ghost
preview, accept bar) is studio-owned code; the package ships no UI.

What deleting layout-lab costs, eyes open:

- the live DSL editor, metrics panel, and guide views (SketchView and
  friends) go away — the studio agent surface becomes the interactive way in
- the R11–R22 candidate rules were lab-only and unreviewed; they stay in git
  history and can be promoted into the rulebook docs later if wanted
- docs/30-agent-layout links to the lab as "the live playground" — those
  pointers are removed in the same commit (a docs maintenance edit, not a
  docs redo); board regeneration becomes
  `bun run --cwd packages/canvas-agent generate:docs-boards`

## 2b. The operator viewer (standalone) + studio's dev rail

**Revised 2026-07-20 (Ford): the trace/operator surface does NOT live inside
studio.** This supersedes the studio-native placement this section
originally specced (a bracketed `src/(agent)/` route group plus a
`page-groups.ts` registry in studio's router). That version was built and
worked; the reversal is about product shape, not feasibility — the operator
surface is a tool you keep open *beside* the canvas in its own window, not a
page inside the editor app.

What exists now:

- **The operator viewer is a standalone app owned by the agent package:**
  `packages/canvas-agent/src/viewer/` — a small Vite React app on port
  **4830** (`make traces` from the repo root, or `bun run dev:agent-viewer`),
  opened in its own browser window side-by-side with studio. Three views
  over plain pathname routing:

  ```
  /traces          session list + live trace viewer (also the "/" fallback)
  /session?id=…    one session: runs, tool calls, context-loader lifecycle,
                   token usage — trace detail
  /config          agent manifest + prompt lab (promptHash lineage)
  ```

  The pages compose the real viewer packages — `KernelTraceViewer` +
  `UsageStrip` + `UsageSummaryPanel` via a shared `TraceDetailView`, and
  `AgentPromptLabContainer` for config — and the dark "instrument" token set
  (`agent-theme.css`) applies at `:root`: the whole app IS the agent
  surface, no scoping wrapper.
- **Data path:** the viewer's vite dev proxy pipes `/api/*` to the harness
  on :4820, so every existing `/api/agent/...` fetch path works verbatim
  with zero CORS work. While the harness is down the proxy answers the same
  502 JSON studio's agent proxy uses, and the pages render a calm "agent
  service is not running" empty state.
- **The viewer deps live in canvas-agent, not studio:**
  `@agent-kernel/viewer-{core,ui,shell}` + `@codecaine-ai/prompt-kit`
  (browser React over the read API; no Bun requirement). Studio ships with
  zero `@agent-kernel/*` / prompt-kit dependencies.
- **Studio keeps exactly two agent-adjacent things:** the agent proxy
  (`server/agent-proxy.ts` — the phase-4 invoke/chat UX needs sessions
  through the studio origin) and the dev rail (below), gated by the
  dev-pages flag (`src/dev-flag.ts`; packaged builds opt in with
  `VITE_STUDIO_DEV_PAGES=1`). The page-group routing convention was removed
  along with the pages.

### The dev rail

Behind the same dev flag, a **right-docked dev sidebar on the canvas route**
(`src/dev/DevRail.tsx`, the StyleRail pattern: edge tab to open, docked
right, doesn't disturb the canvas). It shows live editor internals while
fucking around:

- **Selection** — ids, types, per-object geometry, combined bbox (what Ring 0
  would be)
- **Viewport** — rect + zoom
- **Last change** — action type, `source` (human/agent), `changedObjectIds`
  (halo debugging)
- **Annotations** — including pending `agent-request` ones
- **Agent snapshot** — the exact invoke payload the agent would receive
  right now (scope, boundary arrow count, baselineHash) — this is the
  harness-debugging money view
- **Session** — when a session is live: state, last SSE event, proposal
  count

Feeding it needs one more editor extension beyond the ref handle: an
`onEditorStateChange` callback (selection, viewport, lastChange) from
`InteractiveCanvasEditor`, landed in phase 2 with the handle. The rail's
editor-state half therefore works before the harness exists (phase 2); the
agent-snapshot and session sections light up in phase 3.

## 2c. The ending file tree

Where every piece of logic lands. Rule of thumb: pure math in
`packages/canvas-agent`; anything touching a model or a session in
`packages/canvas-agent-harness`; anything that mutates a document in
`packages/canvas`; anything a person sees in `packages/studio`; layout-lab
shrinks back to being the playground.

```
canvas/                                      (repo root)
├── .agent-kernel/                           NEW, gitignored — kernel runtime state
│   ├── trace.db                             observability SQLite (WAL)
│   ├── kernel.json                          kernel manifest
│   └── pi-sessions/                         Pi JSONL transcripts
├── .pi-agent/                               NEW, gitignored — model access
│   ├── models.json                          codex-lb provider → 127.0.0.1:2455
│   └── auth.json                            empty stub {} — never used
├── Makefile                                 EDIT: `make harness` target
├── package.json                             EDIT: dev:harness script
│
├── packages/canvas-agent/                         NEW — @codecaine-ai/canvas-agent, the whole agent layer
│   ├── package.json                         "." export = pipeline barrel (pure);
│   │                                        deps: @codecaine-ai/canvas (schema/defaults),
│   │                                        link: @agent-kernel/{kernel,db,protocol} (harness-only)
│   ├── assets/
│   │   ├── boards/                          .dsl sources MOVED from layout-lab/assets/canvases
│   │   └── fonts/                           Inter TTFs for resvg (D3)
│   ├── scripts/
│   │   └── generate-docs-boards.ts          MOVED from layout-lab — same command, same output
│   ├── src/
│   │   ├── pipeline/                        PURE — no React, no IO, no kernel imports
│   │   │   ├── index.ts                     barrel (the "." export)
│   │   │   ├── types.ts                     MOVED from layout-lab/src/sketch/types.ts
│   │   │   ├── serialize.ts                 MOVED — parseSketch/serializeSketch (the one parser)
│   │   │   ├── fit.ts                       MOVED — document → program
│   │   │   ├── expand.ts                    MOVED — program → geometry (solve)
│   │   │   ├── route.ts                     MOVED — corridor router, countPathBoxViolations
│   │   │   ├── metrics.ts                   MOVED — decision counts, sketch metrics
│   │   │   ├── units.ts                     MOVED — allocateWeightedUnits (lab's agent/compiler)
│   │   │   ├── router.ts                    MOVED — routeConnectors etc. (lab's agent/router)
│   │   │   ├── occupancy.ts                 MOVED — buildOccupancyGrid (lab's agent/occupancy)
│   │   │   ├── occupancy-ascii.ts           NEW — grid → ASCII (the inspect view; doesn't exist yet)
│   │   │   ├── scope.ts                     NEW — scoped fit: sub-document, frame,
│   │   │   │                                  boundary quoted-ids, pinned outsiders (Ring 0/1/2)
│   │   │   ├── diff.ts                      NEW — baseline vs accepted draft →
│   │   │   │                                  CanvasAgentPatchOperation[] (replaces mapping/to-canvas.ts)
│   │   │   └── lint.ts                      NEW — spacing ladder, off-grid, crossings, overflow
│   │   ├── harness/                         Bun-only — imports pipeline + @agent-kernel/*
│   │   │   ├── server.ts                    Elysia app on :4820 — boots db/manifest/kernel, mounts routes
│   │   │   ├── kernel.ts                    createKernel config (catalog root, aliases, toolRuntime, loaders)
│   │   │   ├── session-store.ts             LayoutSession registry: baseline, scope, draft,
│   │   │   │                                  proposals, SSE subscribers, rebase-on-accept
│   │   │   ├── render.ts                    renderDocumentToSvg + resvg → PNG (the camera)
│   │   │   ├── routes/
│   │   │   │   ├── sessions.ts              create/message/accept/reject/events(SSE)/draft.svg
│   │   │   │   ├── catalog.ts               GET agent, PUT prompt (re-canonicalize, new promptHash)
│   │   │   │   └── kernel-read.ts           mounts @agent-kernel read API (traces)
│   │   │   ├── loaders/
│   │   │   │   └── editor-state.ts          custom loader: selection/viewport/annotations → context
│   │   │   └── agent-catalog/layout-editor/
│   │   │       ├── agent.json               manifest: model alias "layout", turn limits
│   │   │       ├── prompt.json              canonical PromptDocument (content-addressed)
│   │   │       ├── prompt.rendered.md       derived snapshot
│   │   │       └── tools.ts                 defineTools: fit_scope, propose_program,
│   │   │                                      render_draft, inspect, commit/abandon
│   │   ├── protocol.ts                      NEW — types only: session DTOs, SSE event
│   │   │                                      shapes, delta-report structure; exported as
│   │   │                                      ./protocol, imported by harness AND studio
│   │   ├── viewer/                          NEW (2026-07-20) — the standalone operator
│   │   │                                      viewer (§2b): Vite React app on :4830
│   │   │                                      (`make traces`, own browser window); traces,
│   │   │                                      session detail, agent config over the
│   │   │                                      harness APIs via the /api dev proxy
│   │   └── cli.ts                           headless driver — phase-3 exit criterion
│   └── test/
│       ├── fixtures/                        corpus programs lifted from the lab's examples
│       ├── round-trip.test.ts               promoted dev assertion (corpus)
│       ├── no-crossing.test.ts              promoted dev assertion
│       ├── scope.test.ts                    NEW
│       └── diff.test.ts                     NEW
│
├── packages/canvas/                         EXISTS — edits only, no new dirs
│   └── src/
│       ├── state/actions/types.ts           EDIT: +removeObject/+removeConnection in patch union;
│       │                                      +canvas.applyAgentPatch in CanvasAction
│       ├── state/actions/agent-patch.ts     NEW — the applyAgentPatch handler:
│       │                                      ops → existing handlers, one withHistory,
│       │                                      source:"agent", waypoint clears
│       ├── state/reducer.ts                 EDIT: one branch + reconcile gating
│       ├── stage/editor/InteractiveCanvasEditor.tsx
│       │                                    EDIT: ref handle { getEditorSnapshot,
│       │                                      dispatchAgentPatch } + onEditorStateChange
│       │                                      callback (selection/viewport/lastChange)
│       ├── render/types.ts                  EDIT: +cropRect option
│       └── render/static-svg.ts             EDIT: arbitrary-rect crop
│
├── packages/studio/                         EXISTS
│   ├── package.json                         no @agent-kernel/* or prompt-kit deps —
│   │                                          the viewer packages live in canvas-agent (§2b)
│   ├── server/
│   │   ├── canvas-file-api.ts               EDIT: atomic write (temp+rename); delegates /agent
│   │   └── agent-proxy.ts                   NEW — pipes /api/**/agent/* + /api/agent/* → :4820,
│   │                                          SSE passthrough (mounted in Vite dev AND Electron;
│   │                                          the phase-4 invoke UX rides this)
│   └── src/
│       ├── App.tsx                          canvas routes only (list|gallery|canvas|view|embed) —
│       │                                      the page-group branch was removed with the
│       │                                      operator pages (2026-07-20, §2b)
│       ├── dev/
│       │   └── DevRail.tsx                  NEW — right-docked dev sidebar on the canvas
│       │                                      route (same dev flag): selection, viewport,
│       │                                      lastChange, annotations, live agent snapshot,
│       │                                      session state — see §2b "The dev rail"
│       └── agent/                           phase 4 — canvas-facing invoke/review UI
│           ├── InvokePopover.tsx            instruction + scope chips
│           ├── ChatPanel.tsx                the conversation surface: instruction in,
│           │                                  streamed progress/deltas, refine follow-ups
│           ├── GhostPreviewLayer.tsx        three-class preview (rearranged/displaced/new)
│           └── SessionStream.ts             SSE client + accept/refine/reject calls
│                                              (types from @codecaine-ai/canvas-agent/protocol)
│
└── apps/layout-lab/                         DELETED (phase 1) — reference material lives in
                                             docs/30-agent-layout; interaction moves to the
                                             studio agent surface; R11–R22 candidates and the
                                             live DSL editor remain in git history

agent-kernel/  (sibling repo)                consumed via link:, one docs edit already made;
                                             no canvas-specific code lands there — anything
                                             generic we need goes upstream as generic
```

Dependency direction (no cycles):
`canvas-agent/pipeline → canvas(schema only)` ·
`canvas-agent/harness → pipeline + canvas + @agent-kernel/*` ·
`canvas-agent/viewer → viewer pkgs (harness reached over HTTP)` ·
`studio(server) → canvas + proxy` · `studio(src) → canvas`.
Nothing imports the harness; studio and the viewer reach it only over HTTP,
and `pipeline/` never imports `harness/`.

## 3. The kernel instance and the five tools

`createKernel` config, concretely:

```ts
createKernel({
  id: "canvas-agent",
  db,                                    // openKernelDatabase(.agent-kernel/trace.db)
  catalog: { roots: [agentCatalogDir] }, // src/agent-catalog
  models: { aliases: { layout: "gpt-5.5" }, prices: { ... } },   // served by codex-lb, see §6
  toolRuntime: layoutToolRuntime,        // see below
  appContext: ({ options }) => ({ session: store.get(options.sessionId) }),
  loaders: [editorStateLoader],          // selection/viewport/annotations snapshot
  piSessionsDir: ".agent-kernel/pi-sessions",
  concurrency: { maxBackgroundAgents: 1 },   // v1: no subagents
})
```

One agent, `layout-editor`. Its `tools.ts` sidecar registers all five tools;
`toolRuntime` is the harness handle the tools call into — it owns the
per-session state (baseline document, scope, current draft, proposal
history) resolved via the run's session id:

| Tool | Implementation (all in-process, all deterministic except nothing) |
|---|---|
| `fit_scope` | `@codecaine-ai/canvas-agent` scoped fit on the baseline → program text + legend + boundary report |
| `propose_program` | `parseSketch` → validate (line-numbered errors verbatim) → expand/route into a new draft → delta report + lint report; draft replaces the session's current draft |
| `render_draft` | `renderDocumentToSvg(draft, { cropRect })` → resvg → PNG image block to the model |
| `inspect` | full text/geometry per ref + occupancy ASCII (the new serializer) |
| `commit` / `abandon` | ends the run; commit runs program-diff → `CanvasAgentPatchOperation[]`, stores the proposal, emits `proposal-ready` on the SSE stream |

Editor-state context: the invoke payload (below) carries the snapshot;
`editorStateLoader` is a custom loader that formats it (selection summary,
viewport rect, any `agent-request` annotations inside scope with their text)
into the context assembly so the model sees what the user sees before its
first tool call. No polling of the editor — the snapshot is captured at
invoke time and again on refine.

## 4. HTTP surface (harness-owned, studio-proxied)

```
POST /api/canvases/:id/agent/sessions
     { scopeObjectIds, instruction, annotations, viewport, baselineHash }
     → { sessionId }                    creates container + spawns layout-editor
GET  /api/canvases/:id/agent/sessions/:sid/events        SSE: fitted → proposal n
     → lint/delta → rendering → …  → proposal-ready | error | abandoned
POST /api/canvases/:id/agent/sessions/:sid/message       refine (same session, new run)
POST /api/canvases/:id/agent/sessions/:sid/accept
     → { operations, summary }          rebase-check first: if live file hash ≠
                                        baselineHash, refit scope from live doc and
                                        re-solve the accepted program (§2.5); if a
                                        scope object was hand-moved/deleted → 409
POST /api/canvases/:id/agent/sessions/:sid/reject        discard
GET  /api/canvases/:id/agent/sessions/:sid/draft.svg     ghost-preview feed for studio

GET  /api/agent/kernel/*                                 kernel read API (traces,
                                                         sessions) — feeds the standalone
                                                         viewer's KernelTraceViewer mount
GET  /api/agent/catalog/:agent                           agent manifest + prompt
                                                         document + rendered snapshot
PUT  /api/agent/catalog/:agent/prompt                    write prompt.json (harness
                                                         re-canonicalizes, re-derives
                                                         prompt.rendered.md, returns
                                                         the new promptHash)
```

The session surface is studio-proxied, so the invoke/chat UX talks only to
the studio origin in dev and Electron alike; the trace view and prompt
editor reach the same endpoints through the standalone viewer's own /api
dev proxy (§2b). Prompt edits made in the viewer are file edits in the
harness catalog (versioned in this repo); since every kernel session
records its `promptHash`, the trace view can always say which prompt
revision produced which behavior. `bun run doctor` against the trace DB
stays the headless observability check.

## 5. Sequencing

**Phase 1 — `packages/canvas-agent` + layout-lab deletion** (prerequisite,
proposal §7.1, amended)
Create the package; move the pipeline into `src/pipeline/`; move the
docs-board script and its `.dsl` assets in; lift corpus fixtures out of the
lab's examples; promote the round-trip and no-crossing dev assertions to
`bun test`; add the two new pure pieces (scoped fit, program-diff→patch-ops)
with corpus tests. Then delete `apps/layout-lab` and strip the "live
playground" pointers from docs/30-agent-layout (maintenance edit only).
The working docs that live in the lab today — KERNEL-PROPOSAL.md, this
plan, LANGUAGE.md (already migrated into docs/30-agent-layout/10-language;
the file itself is historical) — move to `packages/canvas-agent/` so they survive
the deletion.
Exit: `generate:docs-boards` from its new home regenerates the committed
boards **byte-identically** (the migration gate), tests green, no repo
references to `apps/layout-lab` remain.

**Phase 2 — the apply path** (prerequisite, proposal §7.2)
In `packages/canvas`: add `removeObject`/`removeConnection` to the patch
union; add `canvas.applyAgentPatch { operations, summary }` to the
`CanvasAction` union with a reducer branch mapping ops onto existing
handlers inside **one** `withHistory` entry stamped `source: "agent"`
(section-membership reconcile on; endpoint-moved connectors get waypoints
cleared). Editor gains a ref handle: `{ getEditorSnapshot(), // selection+viewport
dispatchAgentPatch(op[]) }` — the same handle later feeds invoke context —
plus an `onEditorStateChange` callback (selection/viewport/lastChange).
Studio holds the ref and lands the **dev rail** (§2b) on it: its
editor-state sections work now, before any harness exists. Exit: a
hand-built patch dispatched from the dev rail produces one undo step and a
live halo, with `lastChange` visible in the rail.

**Phase 3 — the harness** (this thread's target)
Renderer arbitrary-rect crop in `static-svg.ts`; `@resvg/resvg-js` + Inter
(D3); occupancy ASCII serializer; then `src/harness/` in `packages/canvas-agent`
as specced above; then the studio proxy branch. Fix the bare `writeFile` in
`canvas-file-api.ts` (temp+rename) while in the file.
**Exit criterion / the point of the thread:** `src/cli.ts` runs a full
session headless against a real board —
`bun run --cwd packages/canvas-agent cli --canvas <id> --scope <ids…> --instruction "…"`
— streaming the delta reports to the terminal, writing draft renders to a
scratch dir, and printing the final patch ops. Loop quality iteration starts
there, before any UX exists.

**Phase 4 — the invoke/chat UX** (revised 2026-07-20: the operator half is
no longer studio-native)
The invoke/review UX of proposal §3.2 (toolbar entry, popover, ghost
preview, accept/refine/reject) is studio-native and rides the studio agent
proxy — sessions go through the studio origin. The operator surface —
traces, session detail with context-resolution visibility (the per-loader
lifecycle events are already in the trace), and agent config + prompt
editing via prompt-kit against the catalog endpoints — is the standalone
viewer of §2b (`packages/canvas-agent/src/viewer`, `make traces`), already
built and already the loop's debugging surface while the CLI is still the
driver. Comment-driven invocation (`agent-request` annotations) rides the
same session payload from day one; the dev rail's agent-snapshot and
session sections light up with the session API.

**Phase 5+** (unchanged from the proposal): annotations + make-room
displacement pass, intent persistence.

## 6. Open items surfaced by this plan

- **Model access — resolved (2026-07-20): the models process, not auth.**
  All kernels point at the local models proxy through a custom provider in
  `piAgentDir/models.json` — the same `codex-lb` endpoint
  (`http://127.0.0.1:2455/backend-api/codex`) the simple-research-kernel
  example already uses; `auth.json` stays an empty stub, no login flow, no
  provider keys on disk. The harness ships repo-root `.pi-agent/`
  (gitignored — the proxy token is machine-local) with a `models.json`
  copied from the example's shape; the `layout` alias resolves to a model id
  served by that provider (`gpt-5.5` today; retargeting is a one-line
  models.json/alias edit). Pattern documented upstream in agent-kernel's
  `docs/20-implementation/70-app-adapters/10-application-setup.md`
  ("Model Access: The Models Process, Not Auth").
- `link:` deps are machine-local; fine for now, submodule later if needed.
- Harness assumes same-machine filesystem access to `canvases/` — true for
  dev and Electron; revisit only if studio ever serves remote canvases.
