/**
 * <requests> — the annotation-thread queue with its dispositions.
 *
 * Live from the session, because the queue is document state the harness owns:
 * an entry can be added by the user mid-run, not only by the agent's own
 * add_annotation tool (service/session/tools/workflow/add-annotation.ts).
 * Without a live read the seeded snapshot stands in and the open count renders
 * as "?" rather than a number that might be wrong.
 */
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState } from "../shape";

export function requestsBlock(state: BoardWorkState, live: LivePicture | null): string[] {
  return block(
    "requests",
    `open="${live ? live.openRequests : "?"}"`,
    live ? live.requests : state.seeded.requests,
  );
}
