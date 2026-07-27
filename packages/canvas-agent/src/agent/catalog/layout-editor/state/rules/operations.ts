/**
 * What an action makes true: the op ledger.
 *
 * The counterpart of ../../tools/apply-operation.ts (and of the three other
 * board-touching tools). Every tool result that changed the board or the queue
 * becomes exactly one line — turn, tool, target, status, headline — and
 * ../render/ops.ts is what shows those lines to the model.
 *
 * The ledger records the CALL, not the board: the board itself is re-read live
 * every request, so a line here is the history of the work, never a copy of
 * its result.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { OPS_LOG_LIMIT, OP_SUMMARY_CHARS } from "../policy";
import { capped, type BoardWorkState, type OpLine, type OpStatus } from "../shape";

/** The thirteen typed mutators (service/session/operations). */
export const MUTATION_TOOLS: ReadonlySet<string> = new Set([
  "add_section",
  "update_section",
  "remove_section",
  "fit_section",
  "add_sticky",
  "update_sticky",
  "remove_sticky",
  "add_object",
  "update_object",
  "remove_object",
  "add_connection",
  "update_connection",
  "remove_connection",
]);

/** Every tool whose result changes the board or the queue — the op log. */
export const BOARD_TOOLS: ReadonlySet<string> = new Set([
  ...MUTATION_TOOLS,
  "update_description",
  "add_annotation",
  "resolve_request",
]);

export function firstLine(text: string): string {
  const line = text.split("\n", 1)[0]?.trim() ?? "";
  return line.length > OP_SUMMARY_CHARS ? `${line.slice(0, OP_SUMMARY_CHARS - 1)}…` : line;
}

export function statusOf(text: string, isError: boolean): OpStatus {
  if (isError) return "error";
  const head = text.trimStart();
  if (head.startsWith("APPLIED")) return "applied";
  if (head.startsWith("NO-OP")) return "noop";
  if (head.startsWith("ERROR")) return "error";
  return "note";
}

/**
 * The entity an operation named. Every tool that has a target addresses it
 * either by an id-shaped field — `objectId` / `sectionId` / `stickyId` /
 * `connectionId` on the updates and removes, `id` on resolve_request — or by
 * the payload object it is inserting, which carries its own `id`. A tool with
 * neither (update_description, look) simply has no target, which is why the
 * match is on the key rather than on "the first string argument": a
 * description is not an id.
 */
export function targetOf(input: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(input)) {
    if (key !== "id" && !key.endsWith("Id")) continue;
    if (typeof value === "string" && value.length > 0) return value;
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "view" || value === null || typeof value !== "object") continue;
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/**
 * Append the op line for a board-touching tool result. Tools that change
 * nothing (look) never reach the ledger; a refusal does, marked with its
 * status, because "this was tried and refused" is what stops it being tried
 * again.
 */
export function recordOp(
  state: BoardWorkState,
  event: Extract<SessionEvent, { kind: "tool_result" }>,
  tool: string,
  input: Record<string, unknown>,
  status: OpStatus,
): OpLine[] {
  if (!BOARD_TOOLS.has(tool)) return state.ops;
  return capped(
    [
      ...state.ops,
      {
        turn: state.turns,
        tool,
        target: targetOf(input),
        status,
        summary: firstLine(event.text),
      },
    ],
    OPS_LOG_LIMIT,
  );
}
