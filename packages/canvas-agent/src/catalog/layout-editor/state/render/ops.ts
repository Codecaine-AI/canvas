/**
 * <recent_ops> and <diff> — what this run did, from two directions.
 *
 * <recent_ops> is the ledger ../rules/operations.ts keeps: the calls, newest last,
 * capped to the newest OPS_SHOWN with the true total in the tag. <diff> is the
 * other direction — baseline vs draft, computed live, so it says what actually
 * changed rather than what was attempted. They disagree exactly where a call
 * was refused or was a no-op, which is the useful signal.
 */
import { OPS_SHOWN } from "../policy";
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState, OpLine } from "../shape";

/**
 * The recorded summary is the tool result's own first line, which already
 * opens `STATUS · tool target` — the same facts the ledger fields carry. The
 * line is built from the fields and the summary keeps only what they don't
 * say, so nothing prints twice. The ledger itself stays the verbatim headline.
 */
function detailOf(op: OpLine): string {
  let rest = op.summary;
  const marker = /^(?:APPLIED|NO-OP|ERROR)\s*·\s*/.exec(rest);
  if (marker) rest = rest.slice(marker[0].length);
  if (rest.startsWith(op.tool)) rest = rest.slice(op.tool.length).trimStart();
  if (op.target && rest.startsWith(op.target)) {
    rest = rest.slice(op.target.length).trimStart();
  }
  return rest;
}

function opLine(op: OpLine): string {
  const status = op.status === "noop" ? "NO-OP " : op.status === "error" ? "ERROR " : "";
  const target = op.target ? ` ${op.target}` : "";
  const detail = detailOf(op);
  return `t${op.turn + 1} ${status}${op.tool}${target}${detail ? ` ${detail}` : ""}`;
}

export function opsBlock(state: BoardWorkState): string[] {
  const shown = state.ops.slice(-OPS_SHOWN);
  return block(
    "recent_ops",
    `total="${state.ops.length}" showing="${shown.length}"`,
    shown.map(opLine).join("\n"),
  );
}

/** Omitted entirely when the live document is out of reach — never guessed. */
export function diffBlock(live: LivePicture | null): string[] {
  return live ? block("diff", "", live.diff) : [];
}
