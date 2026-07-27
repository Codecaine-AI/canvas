/**
 * <lints> — the current findings, against the count at spawn.
 *
 * The counts are re-run over the live draft every request, so the block is
 * always the truth about the board right now; the "(was N)" is the only thing
 * that comes from `S`, and it is what turns two numbers into a direction of
 * travel.
 */
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState } from "../shape";

export function lintsBlock(state: BoardWorkState, live: LivePicture | null): string[] {
  const was = state.seeded.lints;
  if (!live) {
    return block(
      "lints",
      `errors="${was.errors}" warnings="${was.warnings}"`,
      "(spawn-time counts; the live report is inside the stale board snapshot above)",
    );
  }
  return block(
    "lints",
    `errors="${live.errors}" warnings="${live.warnings}"`,
    [
      `${live.errors} error${live.errors === 1 ? "" : "s"} · `
      + `${live.warnings} warning${live.warnings === 1 ? "" : "s"} `
      + `(was ${was.errors} · ${was.warnings} at spawn)`,
      live.diagnostics,
    ].join("\n"),
  );
}
