# Style-injection pipeline survey — 2026-07-25

Ground-truth map of how style reaches the layout agent, taken ahead of the craft-targets work (AGENT-NORTH-STAR.md). Read-only findings; nothing here is a design decision.

## Two unrelated "style" systems share a word

- **Viewer prompt-editor styling** — `PromptStyleSettings` / `usePromptStyleSettings` / `PromptStyleRail` / `PROMPT_STYLE_PRESETS` (agent-kernel `packages/viewer-ui/src/agent-viewer/prompt-style-settings.ts`). Paints prompt XML in the editor (fonts, colors, gutters, zebra). `localStorage`-only, CSS-variables-only, deliberately firewalled: "changing these values must never change prompt serialization, hashes, or revision history" (`:12-17`). **Never reaches the agent. Do not host craft numbers here.**
- **The agent style guide** — `StyleTopic` registry in `packages/canvas-agent/src/agent/styles/` rendered by `loaders/style-guide.ts` into the `<style_guide>` context block. This is the injection surface craft targets belong to.

## Agent style guide today

- `StyleTopic` = `{ id, title, prose }` — strings only, no structured data (`styles/types.ts:10-21`). Registry has exactly one topic: `aesthetic` (`styles/index.ts:16-18`, `styles/aesthetic.ts`).
- Rendering: `topicBlock()` + `formatStyleGuide()` (`loaders/style-guide.ts:23-38`), framing line "The house style preferences: deliberate defaults for visual judgment, not laws." Loader is static — ignores `_decl`/`_ctx`, zero per-session variation (`:40-51`).
- Block order (`catalog/layout-editor/context.ts:36-51`, asserted in `test/context-loaders.test.ts:227-228`): `<editor_state> <user_requests> <capabilities> <style_guide> <board_state>`.
- The context is not part of the system prompt: injected once per pi-session as a hidden custom message (accumulation-guard marker), wire order = system prompt → context message → user prompt (`agent-kernel/packages/kernel/src/context/accumulation-guard.ts:89-121`, `spawn-pipeline/spawn-agent.ts:337-351`).

## Where the numbers live today

All craft targets are prose inside `catalog/layout-editor/prompt.json` node strings (mirrored in `prompt.rendered.md`):

- 2–3 nodes/section, split past three — `prompt.json:601`
- board ≈ 7× node area / ~15% ink — `:608`
- 144 side-by-side gutter, 160 stacked, 48 frame padding — `:705`
- nodes 288×96, min 224, 144 row gap, 80 column gap — `:734`
- "targets, not minimums" closer — `:786`

`aesthetic.ts:5,18` explicitly delegates numbers to the prompt. Grep: `288`/`224` appear nowhere in TS — prose only.

Separate **hard floors** (enforcement, not targets) in `board/lints/rules/`: crowding `MIN_HORIZONTAL_GAP = 80`, `MIN_VERTICAL_GAP = 48`; `frame-slack.ts` `MIN_EDGE_SLACK = 320`; `containment.ts` `FRAME_TOLERANCE = 16`.

**Wrinkle:** the prompt's column-gap *target* (80) equals the crowding lint's horizontal *floor* (80) — the "targets, not minimums" separation doesn't hold on that axis. Fix when defining `CraftTargets` defaults (target must sit above the floor).

## Touchpoint list for `CraftTargets`

Fields: node size (w×h), min width, node gap row/column, section gutter h/v, frame padding, board-area multiple, nodes-per-section.

Required (agent-side, no UI):
1. `styles/types.ts` — `CraftTargets` interface.
2. `styles/craft-targets.ts` (new) — default values; the single source of truth replacing the prompt prose.
3. `styles/index.ts` — export.
4. `loaders/style-guide.ts:33-38` — render a `<craft_targets>` sub-block (reuse `topicBlock()` indent convention; `formatStyleGuide()` gains a parameter, ripples to `:44` + tests).
5. `catalog/layout-editor/prompt.json:601,608,705,734` — strip the numbers, keep the craft reasoning; regenerate `prompt.rendered.md`. (Happens naturally inside the W3 rewrite.)
6. `test/styles.test.ts` (topic-id list, 6–36 line band) and `test/context-loaders.test.ts:44-90` (string-matches the framing line) — extend assertions.

Later, only if host-editable targets are wanted:
7. Persist + expose via `sessionData` (route + `service/kernel.ts`); `LoaderResolveContext` already carries `sessionData`, so no kernel signature change.
8. `style-guide.ts` reads `ctx.sessionData?.craftTargets` over defaults — loader stops being static (invalidates the "Static by design" comment and the hash-caching test assumption).
9. A new canvas-owned rail component — **not** `PromptStyleRail`.

Caveat: `packages/eval-suite` was not audited for snapshot tests string-matching the prompt's numeric prose; step 5 may break some.
