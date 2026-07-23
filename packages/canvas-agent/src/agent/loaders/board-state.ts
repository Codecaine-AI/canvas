/**
 * Renders the spawn-time board snapshot the session store places at
 * `sessionData.boardState`: the pre-formatted full digest plus lint
 * report. The agent's context.ts wraps the content in <board_state> tags.
 *
 * When no snapshot is present, a fallback points the model at the board tool
 * instead of leaving an empty block.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

export const BOARD_STATE_FALLBACK =
  "(no board snapshot was captured at spawn — call board for the current full digest and diagnostics before editing)";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export const boardStateLoader: Loader = {
  kind: "board-state",
  async resolve(_decl, ctx): Promise<LoaderResult> {
    const boardState = ctx.sessionData?.boardState;
    const content =
      typeof boardState === "string" && boardState.length > 0
        ? boardState
        : BOARD_STATE_FALLBACK;
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
