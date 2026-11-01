/**
 * `resolve_request` — dispose one user-request queue entry (done/declined +
 * note). The note becomes the closing reply on the thread, so the disposition
 * reads on the board rather than only in the transcript.
 */
import { Type } from "@mariozechner/pi-ai";
import type { CanvasAnnotationStatus } from "@codecaine-ai/canvas/schema";
import { nextId } from "../../../../../../canvas/src/state/actions/helpers";

import { formatRequestsBlock } from "../../snapshots/user-requests";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { emitAnnotations } from "./add-annotation";
import { defineWorkflowTool } from "./workflow-tool";

/** The document status a disposition closes its thread with. */
const DISPOSITION_STATUS: Record<"done" | "declined", CanvasAnnotationStatus> = {
  done: "applied",
  declined: "resolved",
};

export function toolResolveRequest(
  session: LayoutSession,
  id: string,
  status: "done" | "declined",
  note: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (typeof id !== "string" || id.trim() === "") {
    return { isError: true, text: "resolve_request rejected: id must be a non-empty string." };
  }
  if (status !== "done" && status !== "declined") {
    return {
      isError: true,
      text: 'resolve_request rejected: status must be "done" or "declined".',
    };
  }
  if (typeof note !== "string" || note.trim() === "") {
    return {
      isError: true,
      text: "resolve_request rejected: note must be a non-empty string — say what you did, or why you declined.",
    };
  }
  const wanted = id.trim();
  const entry = session.requests.find(
    (request) => request.alias === wanted || request.annotationId === wanted,
  );
  if (!entry) {
    return {
      isError: true,
      text: [
        `resolve_request rejected: no request "${wanted}" in the queue.`,
        formatRequestsBlock(session.requests),
      ].join("\n"),
    };
  }
  if (entry.status !== "open") {
    return {
      isError: true,
      text: [
        `resolve_request rejected: ${entry.alias} is already ${entry.status}.`,
        formatRequestsBlock(session.requests),
      ].join("\n"),
    };
  }
  entry.status = status;
  entry.note = note.trim();

  // The disposition is board content: the note becomes an agent reply in the
  // thread and the thread closes, so the operator sees it on the board rather
  // than only in the transcript. An invoke-only request has no thread on the
  // draft to write to; its disposition stays on the queue entry alone.
  const thread = session.draft.annotations?.find(
    (annotation) => annotation.id === entry.annotationId,
  );
  if (thread) {
    const reply = {
      id: nextId("reply", thread.replies.map((candidate) => candidate.id)),
      author: "agent" as const,
      body: entry.note,
      createdAt: new Date().toISOString(),
    };
    commitDraft(session, {
      ...session.draft,
      annotations: session.draft.annotations?.map((annotation) =>
        annotation.id === entry.annotationId
          ? {
            ...annotation,
            replies: [...annotation.replies, reply],
            status: DISPOSITION_STATUS[status],
          }
          : annotation),
    }, `resolveRequest ${entry.alias}`);
    entry.replies = [...entry.replies, reply];
    emitAnnotations(session, emit);
  }

  return {
    text: formatRequestsBlock(session.requests),
    details: { id: entry.alias, status },
  };
}

export const resolveRequest = defineWorkflowTool({
  name: "resolve_request",
  label: "Resolve user request",
  description:
    "Dispose one entry of the request queue (the REQUESTS block / user_requests context). Use status \"done\" after you have answered the request by editing board content, or \"declined\" when you will not — the note says what you did or why not. The note is posted into the thread as your reply and closes it on the board, so the operator reads it there. Every user-authored request must be disposed before finalize can commit; a thread you opened yourself does not need disposing. Returns the updated REQUESTS block only; the id must name an open entry (e.g. \"R1\").",
  fields: {
    id: Type.String({ description: "The queue id of an open request, e.g. \"R1\"." }),
    status: Type.Union([Type.Literal("done"), Type.Literal("declined")], {
      description: "done = answered on the board; declined = consciously not doing it.",
    }),
    note: Type.String({
      description: "Required. One line for the operator: what you did, or why you declined.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.resolveRequest(
      params.id,
      params.status,
      params.note,
    ),
});
