# Eval-suite fingerprint — 2026-07-24-eval-183037

- run id: `2026-07-24-eval-183037`
- tier: `system`
- git: `3751f3e+dirty`
- SUT agent config: model `codex-lb/gpt-5.6-sol` @ `low` (eval default; agent.json `high`), max turns `300`
- prompt hash: `e8dd8e1f`
- lint hash: `b7d1096d`
- style hash: `5ff78f2e`
- judge client: model `gpt-5.6-sol`, effort `low`, base URL `http://127.0.0.1:2455/v1`
- snapshot fonts: bundled Inter + system fallback (Helvetica default/sans-serif)
- harness start time: pre-existing; health checked 2026-07-24T23:30:37.678Z
- eval canvas directory: `canvases/evals`

## Reference renders

- `gc-decomp-harness`: `/Users/Ford/Github Repos/Codecaine/Core/canvas/canvases/gc-decomp-harness.canvas.json`
- `intent-classification-2`: `/Users/Ford/Github Repos/Codecaine/Core/canvas/canvases/intent-classification-2.canvas.json`

<details><summary>Prompt files</summary>

- `packages/canvas-agent/src/agent/catalog/layout-editor/prompt.json`
- `packages/canvas-agent/src/agent/catalog/layout-editor/prompt.rendered.md`

</details>

<details><summary>Active lint files</summary>

- `packages/canvas-agent/src/board/lints/geometry.ts`
- `packages/canvas-agent/src/board/lints/index.ts`
- `packages/canvas-agent/src/board/lints/rules/broken-edges.ts`
- `packages/canvas-agent/src/board/lints/rules/containment.ts`
- `packages/canvas-agent/src/board/lints/rules/covered-content.ts`
- `packages/canvas-agent/src/board/lints/rules/crowding.ts`
- `packages/canvas-agent/src/board/lints/rules/frame-slack.ts`
- `packages/canvas-agent/src/board/lints/rules/unreadable-labels.ts`
- `packages/canvas-agent/src/board/lints/run.ts`
- `packages/canvas-agent/src/board/lints/types.ts`

</details>

<details><summary>Active style files</summary>

- `packages/canvas-agent/src/agent/styles/aesthetic.ts`
- `packages/canvas-agent/src/agent/styles/index.ts`
- `packages/canvas-agent/src/agent/styles/types.ts`

</details>
