# Eval-suite fingerprint — 2026-07-23-system-smoke

- run id: `2026-07-23-system-smoke`
- tier: `system`
- git: `3751f3e+dirty`
- SUT agent config: model `codex-lb/gpt-5.6-sol`, thinking `high`, max turns `120`
- prompt hash: `3b8797e8`
- lint hash: `3b880b8b`
- style hash: `493e8ea9`
- judge client: model `gpt-5.6-sol`, effort `low`, base URL `http://127.0.0.1:2455/v1`
- harness start time: pre-existing; health checked 2026-07-24T01:06:36.771Z
- eval canvas directory: `canvases/evals`

## Reference renders

- `gc-decomp-harness`: `http://127.0.0.1:4000/api/canvases/gc-decomp-harness/preview.svg`
- `intent-classification-2`: `http://127.0.0.1:4000/api/canvases/intent-classification-2/preview.svg`

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
- `packages/canvas-agent/src/board/lints/rules/unreadable-labels.ts`
- `packages/canvas-agent/src/board/lints/run.ts`
- `packages/canvas-agent/src/board/lints/types.ts`

</details>

<details><summary>Active style files</summary>

- `packages/canvas-agent/src/agent/styles/color-semantics.ts`
- `packages/canvas-agent/src/agent/styles/connectors-and-labels.ts`
- `packages/canvas-agent/src/agent/styles/fan-composition.ts`
- `packages/canvas-agent/src/agent/styles/grid-discipline.ts`
- `packages/canvas-agent/src/agent/styles/index.ts`
- `packages/canvas-agent/src/agent/styles/lanes-and-corridors.ts`
- `packages/canvas-agent/src/agent/styles/registers-and-rhythm.ts`
- `packages/canvas-agent/src/agent/styles/section-framing.ts`
- `packages/canvas-agent/src/agent/styles/spacing-and-corridors.ts`
- `packages/canvas-agent/src/agent/styles/tree-edge-entry.ts`
- `packages/canvas-agent/src/agent/styles/types.ts`

</details>
