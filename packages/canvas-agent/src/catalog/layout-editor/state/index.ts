/**
 * Board v1 — section ③, the layout-editor's state (state-shapes.html §5, D93).
 *
 * The agent is dropped into the current state each turn and asked for the next
 * step, so ③ carries the whole working picture, re-derived per request. This
 * file is only the wiring; the three halves of the kernel contract each have
 * their own place in the folder:
 *
 *   ./shape.ts     the state type `S` and `seed()` — what a run starts from
 *   ./rules/       `update()` — one file per event concern
 *   ./render/      `render()` — one file per block of the state text
 *   ./policy.ts    the caps both sides read: what is kept, what is shown
 *
 * The tools that drive it register in ../tools/ from the service's descriptors
 * (service/session/tools/), and the naming lines up on purpose: a descriptor
 * defines an action, ./rules/operations.ts defines what that action makes
 * true, ./render/ops.ts defines how that truth is shown.
 */
import { defineState } from "@agent-kernel/kernel/agent-definition";

export {
  INSTRUCTIONS_KEPT,
  OPS_LOG_LIMIT,
  OPS_SHOWN,
  OP_SUMMARY_CHARS,
  TAIL_MESSAGES,
  VIEWS_ATTACHED,
  VIEW_REFS_LIMIT,
} from "./policy";
export {
  seedBoardWork,
  type BoardWorkState,
  type OpLine,
  type OpStatus,
  type SeededBoard,
  type ViewRef,
} from "./shape";
export {
  BOARD_TOOLS,
  MUTATION_TOOLS,
  updateBoardWork,
} from "./rules";
export {
  renderBoardWork,
  renderStateBlock,
} from "./render";

import type { BoardWorkState } from "./shape";
import { updateBoardWork } from "./rules";
import { renderBoardWork } from "./render";
import { seedBoardWork } from "./shape";

export const state = defineState<BoardWorkState>({
  seed: (ctx, prior) => seedBoardWork(ctx, prior),
  update: (current, event) => updateBoardWork(current, event),
  render: (current, ctx) => renderBoardWork(current, ctx),
});

export default state;
