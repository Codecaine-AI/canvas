/**
 * <ops> and <diff> — what this run did, from two directions.
 *
 * <ops> is the ledger ../rules/operations.ts keeps: the calls, newest last,
 * capped to the newest OPS_SHOWN with the true total in the tag. <diff> is the
 * other direction — baseline vs draft, computed live, so it says what actually
 * changed rather than what was attempted. They disagree exactly where a call
 * was refused or was a no-op, which is the useful signal.
 */
import { OPS_SHOWN } from "../policy";
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState, OpLine } from "../shape";

function opLine(op: OpLine): string {
  const target = op.target ? ` ${op.target}` : "";
  const mark = op.status === "applied" ? "" : ` [${op.status}]`;
  return `  t${op.turn + 1} ${op.tool}${target}${mark} · ${op.summary}`;
}

export function opsBlock(state: BoardWorkState): string[] {
  const shown = state.ops.slice(-OPS_SHOWN);
  return block(
    "ops",
    `total="${state.ops.length}" showing="${shown.length}"`,
    shown.map(opLine).join("\n"),
  );
}

/** Omitted entirely when the live document is out of reach — never guessed. */
export function diffBlock(live: LivePicture | null): string[] {
  return live ? block("diff", "", live.diff) : [];
}
