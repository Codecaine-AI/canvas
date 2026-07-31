# Eval-suite fingerprint — 2026-07-29-cadence-153707

- run id: `2026-07-29-cadence-153707`
- tier: `system`
- git: `49d293dc+dirty`
- SUT agent config: model `codex-lb/gpt-5.6-sol` @ `low` (eval default; agent.json `high`), max turns `300`
- tool-call cap: 3 (agent default)
- prompt hash: `3acbe92e`
- lint hash: `d6b4248b`
- style hash: `3446d051`
- surface hash: `dd6c1ce8`
- judge client: model `gpt-5.6-sol`, effort `low`, base URL `http://127.0.0.1:2455/v1`
- snapshot fonts: bundled Inter + system fallback (Helvetica default/sans-serif)
- harness start time: 2026-07-29T20:37:08.147Z (ephemeral, spawned for this run and stopped at run end)
- eval services: harness `http://127.0.0.1:61456` pid `93949`, file API `http://127.0.0.1:61453` pid `93877` (see `services/identity.json`)
- eval canvas directory: `canvases/evals`

<details><summary>Prompt files</summary>

- `packages/canvas-agent/src/catalog/layout-editor/prompt/prompt.json`
- `packages/canvas-agent/src/catalog/layout-editor/prompt/system.md`

</details>

<details><summary>Active lint files</summary>

- `packages/canvas-agent/src/board/lints/geometry.ts`
- `packages/canvas-agent/src/board/lints/index.ts`
- `packages/canvas-agent/src/board/lints/rules/broken-edges.ts`
- `packages/canvas-agent/src/board/lints/rules/clipped-text.ts`
- `packages/canvas-agent/src/board/lints/rules/containment.ts`
- `packages/canvas-agent/src/board/lints/rules/covered-content.ts`
- `packages/canvas-agent/src/board/lints/rules/crowding.ts`
- `packages/canvas-agent/src/board/lints/rules/frame-slack.ts`
- `packages/canvas-agent/src/board/lints/rules/unreadable-labels.ts`
- `packages/canvas-agent/src/board/lints/run.ts`
- `packages/canvas-agent/src/board/lints/types.ts`

</details>

<details><summary>Active style files</summary>

- `packages/canvas-agent/src/catalog/layout-editor/context/style-guide/aesthetic.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/style-guide/craft-targets.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/style-guide/index.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/style-guide/types.ts`

</details>

<details><summary>Active tool-surface files</summary>

- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/index.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/connections.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/index.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/objects.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/sections.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/spec.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/kinds/stickies.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/ops.ts`
- `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/vocabulary.generated.ts`
- `packages/canvas-agent/src/catalog/layout-editor/tools/index.ts`
- `packages/canvas-agent/src/catalog/layout-editor/tools/runtime.ts`
- `packages/canvas-agent/src/service/session/apply-ops.ts`
- `packages/canvas-agent/src/service/session/board-trace.ts`
- `packages/canvas-agent/src/service/session/index.ts`
- `packages/canvas-agent/src/service/session/perception/boot.ts`
- `packages/canvas-agent/src/service/session/perception/contact-sheet.ts`
- `packages/canvas-agent/src/service/session/perception/live-draft-view.ts`
- `packages/canvas-agent/src/service/session/perception/op-surface.ts`
- `packages/canvas-agent/src/service/session/perception/perception.ts`
- `packages/canvas-agent/src/service/session/perception/view-log.ts`
- `packages/canvas-agent/src/service/session/perception/views.ts`
- `packages/canvas-agent/src/service/session/registry.ts`
- `packages/canvas-agent/src/service/session/snapshots/board-state.ts`
- `packages/canvas-agent/src/service/session/snapshots/context.ts`
- `packages/canvas-agent/src/service/session/snapshots/editor-state.ts`
- `packages/canvas-agent/src/service/session/snapshots/user-requests.ts`
- `packages/canvas-agent/src/service/session/store.ts`
- `packages/canvas-agent/src/service/session/tools/create-runtime.ts`
- `packages/canvas-agent/src/service/session/tools/creation-defaults.ts`
- `packages/canvas-agent/src/service/session/tools/grid.ts`
- `packages/canvas-agent/src/service/session/tools/index.ts`
- `packages/canvas-agent/src/service/session/tools/operations/arrange.ts`
- `packages/canvas-agent/src/service/session/tools/operations/content.ts`
- `packages/canvas-agent/src/service/session/tools/operations/delete.ts`
- `packages/canvas-agent/src/service/session/tools/operations/edges.ts`
- `packages/canvas-agent/src/service/session/tools/operations/index.ts`
- `packages/canvas-agent/src/service/session/tools/operations/op-context.ts`
- `packages/canvas-agent/src/service/session/tools/operations/operation-tool.ts`
- `packages/canvas-agent/src/service/session/tools/operations/place.ts`
- `packages/canvas-agent/src/service/session/tools/operations/sections.ts`
- `packages/canvas-agent/src/service/session/tools/placeable-types.ts`
- `packages/canvas-agent/src/service/session/tools/runtime.ts`
- `packages/canvas-agent/src/service/session/tools/schemas.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/add-annotation.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/finalize.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/index.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/look.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/reply-annotation.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/resolve-request.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/set-board-title.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/update-description.ts`
- `packages/canvas-agent/src/service/session/tools/workflow/workflow-tool.ts`

</details>
