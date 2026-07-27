/**
 * <views> and the attachment message — which renders are attached below, and
 * the renders themselves.
 *
 * `S` holds only refs (../rules/views.ts); the PNGs live on the session's view
 * log, so a process that cannot reach the session renders the block saying the
 * payloads are unavailable rather than claiming images that are not there.
 *
 * The images go in their own message on purpose: it keeps the state block a
 * LONE text block, which is what the per-turn viewer keys its state
 * pretty-printer on.
 */
import type { AgentMessage } from "@agent-kernel/kernel/state";

import { describeSessionView, type SessionView } from "../../../../../service/session/view-log";
import { block } from "./block";
import type { BoardWorkState } from "../shape";

export function viewsBlock(state: BoardWorkState, attached: SessionView[]): string[] {
  const viewNote = attached.length === 0
    ? state.views.length === 0
      ? "no renders yet — call look for a full-board render"
      : "renders were taken but their payloads are not available in this process"
    : attached
        .map((view, index) => `(${index + 1}) ${describeSessionView(view)}`)
        .join(" · ");
  return block(
    "views",
    `attached="${attached.length}" taken="${state.views.length}"`,
    viewNote,
  );
}

/** One caption block, then the newest views as images. */
export function viewsMessage(views: SessionView[]): AgentMessage {
  const caption = [
    `attached renders, newest first: ${views
      .map((view, index) => `(${index + 1}) ${describeSessionView(view)}`)
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
