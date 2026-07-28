/**
 * <views> and the attachment message — the eager current-board render, then
 * up to three immediately prior post-change renders and their captions.
 *
 * PNGs stay in process on the session. `S` remains JSON-serializable, while
 * `look` result images survive through the recent real-message tail rather
 * than joining this change-history attachment.
 *
 * The images go in their own message on purpose: it keeps the state block a
 * LONE text block, which is what the per-turn viewer keys its state
 * pretty-printer on.
 */
import type { AgentMessage } from "@agent-kernel/kernel/state";

import type { LiveDraftView } from "../../../../service/session/perception/live-draft-view";
import type { ChangeRender } from "../../../../service/session/store";
import { block } from "./block";
import type { BoardWorkState } from "../shape";

export type AttachedView = LiveDraftView | ({ kind: "change" } & ChangeRender);

export interface ViewsBlockOptions {
  /** Number of prior-change renders attached after the current board. */
  priorChanges?: number;
  /** Present when the eager current-board raster could not be produced. */
  currentRenderFailure?: string;
}

function describeAttachedView(view: AttachedView): string {
  return view.kind === "current-board"
    ? "the board as it stands now"
    : `after ${view.summary}`;
}

export function viewsBlock(
  state: BoardWorkState,
  attached: AttachedView[],
  options: ViewsBlockOptions = {},
): string[] {
  const priorChanges = options.priorChanges ?? 0;
  const descriptions = attached
    .map((view, index) => `(${index + 1}) ${describeAttachedView(view)}`)
    .join("\n");
  const viewNote = options.currentRenderFailure !== undefined
    ? descriptions.length > 0
      ? `${options.currentRenderFailure} · showing prior changes only:\n${descriptions}`
      : `${options.currentRenderFailure} · no prior change renders are available`
    : attached.length === 0
      ? state.views.length === 0
        ? "the current-board render is not available in this process"
        : "current/change render payloads are unavailable; look refs exist only for the conversation tail"
      : descriptions;
  return block(
    "views",
    `attached="${attached.length}" prior_changes="${priorChanges}"`,
    viewNote,
  );
}

/** One caption block, then current board and prior changes, newest first. */
export function viewsMessage(views: AttachedView[]): AgentMessage {
  const caption = [
    `attached renders: ${views
      .map((view, index) => `(${index + 1}) ${describeAttachedView(view)}`)
      .join(", ")}`,
  ].join("\n");
  return {
    role: "user",
    content: [
      { type: "text", text: caption },
      ...views.map((view) => ({
        type: "image",
        data: view.png.toString("base64"),
        mimeType: "image/png",
      })),
    ],
    timestamp: Date.now(),
  } as unknown as AgentMessage;
}
