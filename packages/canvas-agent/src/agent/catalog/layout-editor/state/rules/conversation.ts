/**
 * The messages component: the ask, and the clock.
 *
 * Not a tool's counterpart — these are the two events that arrive without one.
 * A user message is steering, and steering is kept verbatim (bounded, deduped)
 * because the tail in section ③ is deliberately short and must not be the only
 * place the ask survives; ../render/scope.ts renders them as <instruction>.
 * `turn_end` advances the turn number every op line and view ref is stamped
 * with.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { INSTRUCTIONS_KEPT } from "../policy";
import { capped, type BoardWorkState } from "../shape";

export function recordSteering(
  state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "user_message" }>,
): string[] {
  const text = event.text.trim();
  if (text.length === 0 || state.instructions.includes(text)) return state.instructions;
  return capped([...state.instructions, text], INSTRUCTIONS_KEPT);
}

export function advanceTurn(
  _state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "turn_end" }>,
): number {
  return event.turnIndex + 1;
}
