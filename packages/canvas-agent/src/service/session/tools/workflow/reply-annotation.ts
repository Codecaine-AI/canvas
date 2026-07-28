/**
 * `reply_annotation` — say something in a thread without closing it.
 *
 * The reply-append half of resolve_request, on its own: same document write
 * (a new `agent` reply on the thread, id minted against the thread's own
 * replies), minus the two things that dispose a request — the queue entry's
 * status/note and the thread's closing status. resolve_request stays the
 * closing move; this is for answering a follow-up, reporting progress, or
 * asking one more thing inside an open thread.
 *
 * `id` accepts either grammar the queue speaks — the session alias (R1) or the
 * underlying annotation id — because the model reads both off the REQUESTS
 * block. The reply lands on the DRAFT, so a thread that exists only as an
 * invoke-time entry (no annotation on the document) has nowhere to write and
 * says so rather than writing a reply the next queue sync would erase.
 */
import { Type } from "@mariozechner/pi-ai";
import { nextId } from "../../../../../../canvas/src/state/actions/helpers";

import {
  formatRequestsBlock,
  targetText,
} from "../../snapshots/user-requests";
import { syncSessionRequests } from "../../snapshots/context";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { emitAnnotations } from "./add-annotation";
import { defineWorkflowTool } from "./workflow-tool";

export function toolReplyAnnotation(
  session: LayoutSession,
  id: string,
  body: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (typeof id !== "string" || id.trim() === "") {
    return { isError: true, text: "reply_annotation rejected: id must be a non-empty string." };
  }
  if (typeof body !== "string" || body.trim() === "") {
    return {
      isError: true,
      text: "reply_annotation rejected: body must be a non-empty message for the thread.",
    };
  }
  const wanted = id.trim();
  const entry = session.requests.find(
    (request) => request.alias === wanted || request.annotationId === wanted,
  );
  const annotationId = entry?.annotationId ?? wanted;
  const thread = session.draft.annotations?.find(
    (annotation) => annotation.id === annotationId,
  );
  if (!thread) {
    return {
      isError: true,
      text: [
        `reply_annotation rejected: no thread "${wanted}" on the board to reply to.`,
        formatRequestsBlock(session.requests),
      ].join("\n"),
    };
  }

  const reply = {
    id: nextId("reply", thread.replies.map((candidate) => candidate.id)),
    author: "agent" as const,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  commitDraft(session, {
    ...session.draft,
    // Status is deliberately untouched: replying is not disposing.
    annotations: session.draft.annotations?.map((annotation) =>
      annotation.id === annotationId
        ? { ...annotation, replies: [...annotation.replies, reply] }
        : annotation),
  }, `replyAnnotation ${annotationId}`);
  syncSessionRequests(session);
  emitAnnotations(session, emit);

  return {
    text: [
      `APPLIED · replyAnnotation ${annotationId}`,
      `DELTA · reply on ${targetText(thread.target)}`
      + `  agent — ${JSON.stringify(reply.body)}`,
      formatRequestsBlock(session.requests),
    ].join("\n"),
    details: { operation: "reply_annotation", annotationId, replyId: reply.id },
  };
}

export const replyAnnotation = defineWorkflowTool({
  name: "reply_annotation",
  label: "Reply in a thread",
  description:
    "Post a reply into an existing annotation thread without closing it — answer a follow-up, report what you did so far, or ask one more thing in the same place. The thread's status does not move; resolve_request is still what disposes a request. Returns the applied line and the updated REQUESTS block.",
  fields: {
    id: Type.String({
      description: "The thread to reply in: its queue alias (R1) or its annotation id.",
    }),
    body: Type.String({
      description: "What to say, in plain language, readable on its own.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.replyAnnotation(params.id, params.body),
});
