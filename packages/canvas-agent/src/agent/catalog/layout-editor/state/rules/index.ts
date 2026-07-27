/**
 * `update` — the dispatch. One file per event concern, and this file only
 * routes to them and keeps the bookkeeping every event shares (the counters
 * and `lastEventSeq`, which is what lets the kernel's catch-up know what it has
 * already applied).
 *
 *   ./operations.ts    board- and queue-touching tool results → the op ledger
 *   ./views.ts         renders that landed → view refs
 *   ./outcome.ts       a successful finalize → the terminal outcome
 *   ./conversation.ts  user messages → steering · turn_end → the turn clock
 *
 * There is deliberately no lints rule and no requests rule, even though ③ has
 * both blocks: lint findings and the request queue are read live from the
 * session at render time (../render/live.ts), so nothing about them is state to
 * advance. A rule file here would be a second, staler copy of a truth the
 * document already owns.
 *
 * `update` is pure: it copies the state and returns the copy, never mutating
 * its input.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import type { BoardWorkState } from "../shape";
import { advanceTurn, recordSteering } from "./conversation";
import { recordOp, statusOf } from "./operations";
import { recordOutcome } from "./outcome";
import { recordViews } from "./views";

export {
  BOARD_TOOLS,
  MUTATION_TOOLS,
  firstLine,
  statusOf,
  targetOf,
} from "./operations";

export function updateBoardWork(
  state: BoardWorkState,
  event: SessionEvent,
): BoardWorkState {
  const next: BoardWorkState = { ...state, lastEventSeq: event.seq };

  switch (event.kind) {
    case "user_message": {
      next.userMessages = state.userMessages + 1;
      next.instructions = recordSteering(state, event);
      return next;
    }

    case "tool_call": {
      next.toolCalls = state.toolCalls + 1;
      next.pending = {
        ...state.pending,
        [event.toolCallId]: { tool: event.toolName, input: event.input },
      };
      return next;
    }

    case "tool_result": {
      const call = state.pending[event.toolCallId];
      const input = call?.input ?? {};
      const pending = { ...state.pending };
      delete pending[event.toolCallId];
      next.pending = pending;
      if (event.isError) next.toolErrors = state.toolErrors + 1;

      const tool = event.toolName || call?.tool || "";
      const status = statusOf(event.text, event.isError);

      next.ops = recordOp(state, event, tool, input, status);
      next.outcome = recordOutcome(state, event, tool, input);
      next.views = recordViews(state, event, tool, input);
      return next;
    }

    case "turn_end":
      next.turns = advanceTurn(state, event);
      return next;
  }
}
