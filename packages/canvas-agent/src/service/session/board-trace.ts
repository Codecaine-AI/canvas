/**
 * End-of-turn board-render trace publication — after every agent turn the
 * harness pushes the session's current full-board raster into the kernel
 * trace as an "app:board-render" event. The PNG lands in the content-
 * addressed trace blob store (deduped against the per-turn request snapshot,
 * which stores the same bytes) and the event references it by hash; the trace
 * viewer nests the event under that turn and renders the image in the detail
 * panel when the row is selected.
 */
import {
  hashTraceBlobBytes,
  upsertTraceBlobs,
  type KernelDatabase,
} from "@agent-kernel/db";
import { currentTraceIds, getRunContext } from "@agent-kernel/kernel";
import { createAppEvent } from "@agent-kernel/protocol";

export const BOARD_RENDER_EVENT_TYPE = "app:board-render";

/** The slice of CurrentBoardRender (./store) this module reads. */
export interface BoardRenderSnapshot {
  png: Buffer;
  /** Applied-change ordinal; zero for the spawn render. */
  n: number;
  /** Gesture summary that produced this board, or the spawn label. */
  summary: string;
}

/**
 * Publish one end-of-turn board render. Must be called synchronously from the
 * spawn's onTurnEnd hook: the run context, trace ids, and event timestamp are
 * captured before any await so the event stays attributed to — and ordered
 * within — the turn that produced it. Never throws; a trace publication
 * failure is logged and the run continues.
 */
export function emitBoardRenderTraceEvent(
  db: KernelDatabase,
  board: BoardRenderSnapshot | undefined,
  turnCount: number,
): Promise<void> {
  try {
    if (!board) return Promise.resolve();
    const { traceWriter } = getRunContext();
    const ids = currentTraceIds();
    if (!ids.piSessionUuid) {
      // Without the pi-session identity the viewer cannot bucket the event
      // under the agent at all — skip rather than emit an orphan.
      console.error(
        "canvas-agent board-render trace event skipped: run context has no piSessionUuid.",
      );
      return Promise.resolve();
    }
    const at = new Date().toISOString();
    const png = board.png;
    const blobHash = hashTraceBlobBytes(png);
    const event = createAppEvent(
      BOARD_RENDER_EVENT_TYPE,
      ids,
      {
        blob_hash: blobHash,
        mimeType: "image/png",
        byte_length: png.byteLength,
        n: board.n,
        summary: board.summary,
        // 1-based end-of-turn hook count …
        turn: turnCount,
        // … and the 0-based pi numbering, so same-millisecond ordering ties
        // resolve inside the turn whose pi_request_snapshot carries the same
        // number.
        turn_number: turnCount - 1,
      },
      { timestamp: at },
    );
    // The event is submitted only after its blob exists, so a viewer that can
    // see the event can always fetch the image.
    return upsertTraceBlobs(db, [
      {
        hash: blobHash,
        kind: "image",
        mimeType: "image/png",
        byteLength: png.byteLength,
        data: png,
        createdAt: at,
      },
    ])
      .then(() => {
        traceWriter.submit(event);
      })
      .catch((error) => {
        console.error("canvas-agent board-render trace event failed:", error);
      });
  } catch (error) {
    console.error("canvas-agent board-render trace event failed:", error);
    return Promise.resolve();
  }
}
