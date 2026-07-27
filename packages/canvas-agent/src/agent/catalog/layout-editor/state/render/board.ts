/**
 * <board> — the full digest of the document as it stands at this instant.
 *
 * Never a stale snapshot: the picture comes from ./live.ts, which reads the
 * session's draft directly. When that read is impossible the block carries the
 * spawn snapshot instead and `fresh="no"` says so in the tag, so the model can
 * tell a current board from an old one without being told.
 */
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState } from "../shape";

export function boardBlock(state: BoardWorkState, live: LivePicture | null): string[] {
  if (live) {
    return block(
      "board",
      `fresh="yes" objects="${live.objects}" edges="${live.edges}"`,
      [live.description, live.digest].join("\n"),
    );
  }
  return block(
    "board",
    'fresh="no"',
    [
      "(the live board could not be read — what follows is the snapshot taken"
      + " when the run started and may be out of date; call look for a current"
      + " render)",
      state.seeded.board,
    ].join("\n"),
  );
}
