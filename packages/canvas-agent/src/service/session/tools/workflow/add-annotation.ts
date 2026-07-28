/**
 * `add_annotation` — anchor an agent-authored question thread to one object.
 * Also home of the annotations event emitter the thread tools share.
 */
import { Type } from "@mariozechner/pi-ai";
import type { InteractiveCanvasAnnotation } from "@codecaine-ai/canvas/schema";
import { nextId } from "../../../../../../canvas/src/state/actions/helpers";

import {
  formatRequestsBlock,
  targetText,
} from "../../snapshots/user-requests";
import type { AgentSessionAnnotation } from "../../../../protocol";
import { syncSessionRequests } from "../../snapshots/context";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

/** Notify studio that the draft's annotation threads moved. */
export function emitAnnotations(session: LayoutSession, emit: SessionEventSink): void {
  emit(session, {
    type: "annotations",
    sessionId: session.id,
    annotations: (session.draft.annotations ?? []) as unknown as AgentSessionAnnotation[],
  });
}

/**
 * Open an agent-authored thread on one object. The thread rides the draft like
 * any board content, joins the request queue labelled `agent`, and never
 * blocks the run: the question is left behind and the user answers it on their
 * own time.
 */
export function toolAddAnnotation(
  session: LayoutSession,
  objectId: string,
  body: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (typeof objectId !== "string" || objectId.trim() === "") {
    return {
      isError: true,
      text: "add_annotation rejected: objectId must name an object on the board.",
    };
  }
  if (typeof body !== "string" || body.trim() === "") {
    return {
      isError: true,
      text: "add_annotation rejected: body must be a non-empty question for the user.",
    };
  }
  const target = objectId.trim();
  if (!session.draft.objects.some((object) => object.id === target)) {
    return {
      isError: true,
      text: `add_annotation rejected: no object "${target}" on the board.`,
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
    `addAnnotation ${annotation.id}`,
  );
  syncSessionRequests(session);
  emitAnnotations(session, emit);

  return {
    text: [
      `APPLIED · addAnnotation ${annotation.id}`,
      `DELTA · thread ${annotation.id} opened on ${targetText(annotation.target)}`
      + `  agent — ${JSON.stringify(annotation.body)}`,
      formatRequestsBlock(session.requests),
    ].join("\n"),
    details: { operation: "add_annotation", annotationId: annotation.id },
  };
}

export const addAnnotation = defineWorkflowTool({
  name: "add_annotation",
  label: "Ask about an object",
  description:
    "Anchor a question to one object as an annotation thread the user answers on their own time. Use it only where the answer would genuinely change the diagram and you cannot settle it yourself — one or two per run at most; a question on every object is noise, not care. This never waits: leave the question, proceed on your best reading, and name any open thread in the finalize message. Returns the applied line and the updated REQUESTS block.",
  fields: {
    objectId: Type.String({
      description: "The id of the object the question is about.",
    }),
    body: Type.String({
      description: "The question, in plain language, specific enough to answer without further context.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.addAnnotation(params.objectId, params.body),
});
