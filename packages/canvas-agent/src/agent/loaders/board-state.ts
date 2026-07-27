/**
 * Renders the spawn-time board snapshot the session store places at
 * `sessionData.boardState`: the pre-formatted description, full digest, and
 * lint report. The agent's context.ts wraps the content in <board_state> tags.
 *
 * When no snapshot is present, a fallback explains that look returns the full
 * BOARD digest; the lint report travels as the LINTS delta block.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

export const BOARD_STATE_FALLBACK =
  "(no board snapshot was captured at spawn — look returns the full BOARD digest; the lint report travels as the LINTS delta block)";

/** The board's standing account, kept separate from its structural digest. */
export function formatBoardDescription(description?: string): string {
  if (description === undefined || description.trim() === "") {
    return "DESCRIPTION · none — this board has no description yet";
  }
  return [
    "DESCRIPTION · what this board represents, its pieces, and how it reads",
    "---",
    description,
    "---",
  ].join("\n");
}

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
