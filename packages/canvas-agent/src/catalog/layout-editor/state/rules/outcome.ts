/**
 * What an action makes true: the run ended.
 *
 * The counterpart of service/session/tools/workflow/finalize.ts. A successful
 * finalize is the one event that closes the run, so it is the one event that
 * writes a terminal field. A blocked finalize is an error result and leaves
 * the outcome null — the run continues, and the refusal is on the op ledger
 * like any other.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { str, type BoardWorkState } from "../shape";
import { firstLine } from "./operations";

export function recordOutcome(
  state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "tool_result" }>,
  tool: string,
  input: Record<string, unknown>,
): BoardWorkState["outcome"] {
  if (tool !== "finalize" || event.isError) return state.outcome;
  return {
    outcome: str(input.outcome) || "committed",
    message: str(input.message) || firstLine(event.text),
  };
}
