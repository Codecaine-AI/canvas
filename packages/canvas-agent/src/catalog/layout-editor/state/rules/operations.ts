/**
 * What an action makes true: the op ledger.
 *
 * The counterpart of the board- and queue-touching tools, defined in
 * service/session/tools/ and registered via ../../tools/index.ts. Every tool
 * result that changed the board or the queue becomes exactly one line — turn,
 * tool, target, status, headline — and ../render/ops.ts is what shows those
 * lines to the model.
 *
 * The ledger records the CALL, not the board: the board itself is re-read live
 * every request, so a line here is the history of the work, never a copy of
 * its result.
 */
import type { SessionEvent } from "@agent-kernel/kernel/state";

import { operationTools } from "../../../../service/session/tools/operations";
import { OPS_LOG_LIMIT, OP_SUMMARY_CHARS } from "../policy";
import { capped, type BoardWorkState, type OpLine, type OpStatus } from "../shape";

/**
 * The typed mutators, read off the descriptor roster itself
 * (service/session/tools/operations) rather than restated here. A gesture
 * added to or dropped from that roster moves this set with it, so the ledger
 * can never fall behind the surface — the failure mode a hand-kept literal
 * invites is a silently unlogged tool.
 */
export const MUTATION_TOOLS: ReadonlySet<string> = new Set(
  operationTools.map((tool) => tool.name),
);

/**
 * Every tool whose result changes the board or the queue — the op log. The
 * mutators plus the five hand-registered tools that write outside the
 * operation factory: the description, the request queue (annotate, resolve,
 * reply), and the board title.
 */
export const BOARD_TOOLS: ReadonlySet<string> = new Set([
  ...MUTATION_TOOLS,
  "update_description",
  "add_annotation",
  "resolve_request",
  "reply_annotation",
  "set_board_title",
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
 * The entity an operation named. Every tool that has a target addresses it in
 * one of four shapes, tried in this order:
 *
 *   1. `id` — the gesture surface's own convention: the thing being placed,
 *      moved, restyled, routed, or deleted. Taken first so `clone`, which
 *      carries both `id` and `sourceId`, logs the copy it made rather than the
 *      original it read.
 *   2. any other `*Id` key — `objectId` / `sectionId` / `stickyId` /
 *      `connectionId` on the surviving per-kind tools, `sourceId` on a clone
 *      whose own id somehow did not arrive.
 *   3. `ids` — the two multi-target arrange gestures (`align`, `space_out`).
 *      A ledger line holds one target, so the line names the first box and
 *      counts the rest: `alpha +2`.
 *   4. a nested payload object carrying its own `id` — the insert-a-record
 *      tools.
 *
 * A tool with none of them (update_description, look) simply has no target,
 * which is why the match is on the key rather than on "the first string
 * argument": a description is not an id.
 */
export function targetOf(input: Record<string, unknown>): string | null {
  const own = input.id;
  if (typeof own === "string" && own.length > 0) return own;
  for (const [key, value] of Object.entries(input)) {
    if (!key.endsWith("Id")) continue;
    if (typeof value === "string" && value.length > 0) return value;
  }
  for (const value of Object.values(input)) {
    if (!Array.isArray(value)) continue;
    const ids = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (ids.length === 0) continue;
    return ids.length === 1 ? ids[0]! : `${ids[0]!} +${ids.length - 1}`;
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
