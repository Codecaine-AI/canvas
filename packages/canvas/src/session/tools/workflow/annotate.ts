/**
 * `annotate` — write in an annotation thread: open a new one on an object, or
 * reply in one that exists. Also home of the annotations event emitter the
 * thread tools share.
 *
 * The call sends exactly one of `objectId` or `thread`, and a null one counts
 * as absent, so a client that sends every key still picks one branch.
 *
 * - `objectId` opens an agent-authored question thread on that object. The
 *   thread rides the draft like any board content, joins the request queue
 *   labelled `agent`, and never blocks the run: the question is left behind and
 *   the user answers it on their own time.
 * - `thread` appends an agent reply, the reply-append half of resolve_request
 *   on its own: the same document write (a new `agent` reply on the thread, id
 *   minted against the thread's own replies), minus the two things that dispose
 *   a request — the queue entry's status/note and the thread's closing status.
 *   resolve_request stays the closing move.
 *
 * `thread` accepts either grammar the queue speaks — the session alias (R1) or
 * the underlying annotation id — because the model reads both off the REQUESTS
 * block. The reply lands on the DRAFT, so a thread that exists only as an
 * invoke-time entry (no annotation on the document) has nowhere to write and
 * says so rather than writing a reply the next queue sync would erase.
 */
import { Type } from "@mariozechner/pi-ai";
import type { InteractiveCanvasAnnotation } from "../../../state/schema";
import { nextId } from "../../../state/actions/helpers";

import {
  formatRequestsBlock,
  targetText,
} from "../../snapshots/user-requests";
import type { AgentSessionAnnotation } from "../../protocol";
import { syncSessionRequests } from "../../snapshots/context";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../session";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

/** What `annotate` was sent. A null `objectId` or `thread` counts as absent. */
export interface AnnotateFields {
  objectId?: string | null;
  thread?: string | null;
  body: string;
}

/** Notify studio that the draft's annotation threads moved. */
export function emitAnnotations(session: LayoutSession, emit: SessionEventSink): void {
  emit(session, {
    type: "annotations",
    sessionId: session.id,
    annotations: (session.draft.annotations ?? []) as unknown as AgentSessionAnnotation[],
  });
}

export function toolAnnotate(
  session: LayoutSession,
  fields: AnnotateFields,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const objectId = fields.objectId ?? undefined;
  const thread = fields.thread ?? undefined;
  if ((objectId === undefined) === (thread === undefined)) {
    return {
      isError: true,
      text: objectId === undefined
        ? "annotate rejected: send exactly one of objectId or thread."
        : "annotate rejected: send exactly one of objectId or thread, not both.",
    };
  }
  return objectId !== undefined
    ? openThread(session, objectId, fields.body, emit)
    : replyInThread(session, thread!, fields.body, emit);
}

/** The `objectId` branch: open an agent-authored thread on one object. */
function openThread(
  session: LayoutSession,
  objectId: string,
  body: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (typeof objectId !== "string" || objectId.trim() === "") {
    return {
      isError: true,
      text: "annotate rejected: objectId must name an object on the board.",
    };
  }
  if (typeof body !== "string" || body.trim() === "") {
    return {
      isError: true,
      text: "annotate rejected: body must be a non-empty question for the user.",
    };
  }
  const target = objectId.trim();
  if (!session.draft.objects.some((object) => object.id === target)) {
    return {
      isError: true,
      text: `annotate rejected: no object "${target}" on the board.`,
    };
  }

  const annotations = session.draft.annotations ?? [];
  const annotation: InteractiveCanvasAnnotation = {
    id: nextId("annotation", annotations.map((candidate) => candidate.id)),
    target: { kind: "object", objectId: target },
    intent: "agent-request",
    body: body.trim(),
    status: "open",
    createdBy: "agent",
    createdAt: new Date().toISOString(),
    replies: [],
  };
  commitDraft(
    session,
    { ...session.draft, annotations: [...annotations, annotation] },
    `annotate ${annotation.id}`,
  );
  syncSessionRequests(session);
  emitAnnotations(session, emit);

  return {
    text: [
      `APPLIED · annotate ${annotation.id}`,
      `DELTA · thread ${annotation.id} opened on ${targetText(annotation.target)}`
      + `  agent — ${JSON.stringify(annotation.body)}`,
      formatRequestsBlock(session.requests),
    ].join("\n"),
    details: { operation: "annotate", annotationId: annotation.id },
  };
}

/** The `thread` branch: append an agent reply and leave the status alone. */
function replyInThread(
  session: LayoutSession,
  id: string,
  body: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (typeof id !== "string" || id.trim() === "") {
    return { isError: true, text: "annotate rejected: thread must be a non-empty string." };
  }
  if (typeof body !== "string" || body.trim() === "") {
    return {
      isError: true,
      text: "annotate rejected: body must be a non-empty message for the thread.",
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
        `annotate rejected: no thread "${wanted}" on the board to reply to.`,
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
  }, `annotate ${annotationId}`);
  syncSessionRequests(session);
  emitAnnotations(session, emit);

  return {
    text: [
      `APPLIED · annotate ${annotationId}`,
      `DELTA · reply on ${targetText(thread.target)}`
      + `  agent — ${JSON.stringify(reply.body)}`,
      formatRequestsBlock(session.requests),
    ].join("\n"),
    details: { operation: "annotate", annotationId, replyId: reply.id },
  };
}

export const annotate = defineWorkflowTool({
  name: "annotate",
  label: "Annotate",
  description:
    "Write in an annotation thread. Send exactly one of objectId or thread, with a body; a null objectId or thread counts as absent. objectId opens a new question thread on that object, which the user answers on their own time. Ask only where the answer would genuinely change the diagram and you cannot settle it yourself — one or two per run at most; a question on every object is noise, not care. A new thread never waits: leave the question and proceed on your best reading. thread posts a reply into an existing thread without closing it — answer a follow-up, report what you did so far, or ask one more thing in the same place. The thread's status does not move; resolve_request is still what disposes a request. Returns the applied line and the updated REQUESTS block.",
  fields: {
    objectId: Type.Optional(Type.Union([Type.String(), Type.Null()], {
      description: "The id of the object a new thread asks about. Send it to open a thread.",
    })),
    thread: Type.Optional(Type.Union([Type.String(), Type.Null()], {
      description: "The thread to reply in: its queue alias (R1) or its annotation id. Send it to reply.",
    })),
    body: Type.String({
      description: "What to say, in plain language, readable on its own. A new thread's question is specific enough to answer without further context.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.annotate({ objectId: params.objectId, thread: params.thread, body: params.body }),
});
