/**
 * The layout-tool implementations behind the runtime — typed operation
 * dispatch, look, update_description, add_annotation, resolve_request, and
 * finalize — and `createToolRuntime`, which binds them to the store's current
 * session.
 *
 * Each operation returns perception sized for one operation: its delta, lint
 * delta, scoped digest, and an optional requested render. `look` is the
 * deliberate full-board read. Finalize re-runs the E-tier gate and requires
 * every user-authored request to be disposed before committing; a thread the
 * agent opened is non-blocking, so an unanswered question never traps the run.
 */
import { nextId } from "../../../../canvas/src/state/actions/helpers";
import type {
  InteractiveCanvasAnnotation,
  CanvasAnnotationStatus,
} from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../../board/doc-diff";
import { FINISHING_RULES } from "../../board/lints";
import { formatDiagnostics, runDiagnostics } from "../../board/lints/run";
import {
  formatRequestLine,
  formatRequestsBlock,
  targetText,
} from "../../agent/loaders/user-requests";
import type {
  AgentProposal,
  AgentSessionAnnotation,
  AgentSessionEvent,
} from "../../protocol";
import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "../tool-runtime";
import { describePatchOperation } from "./apply-ops";
import { scopedDiagnostics, syncSessionRequests } from "./context";
import { toolLook } from "./look";
import { createOpContext } from "./op-context";
import type { OperationHost } from "./operation-tool";
import { findOperationTool } from "./operations";
import type { SessionEventSink } from "./perception";
import type { LayoutSession } from "./store";

export interface LayoutToolState {
  renderCount: number;
}

export interface LayoutToolHost {
  currentSession(): LayoutSession;
  emit(session: LayoutSession, event: AgentSessionEvent): void;
  onRender(sessionId: string, png: Buffer, index: number): void;
}

export function createLayoutToolState(): LayoutToolState {
  return { renderCount: 0 };
}

/**
 * Dispatch one typed operation against the current draft. An unknown name can
 * only mean the registered surface and the spec table have drifted apart.
 */
export function toolOperation(
  session: LayoutSession,
  name: string,
  params: Record<string, unknown>,
  emit: SessionEventSink,
  onRender?: (png: Buffer) => void,
): LayoutToolRenderResult {
  const tool = findOperationTool(name);
  if (!tool) {
    return { isError: true, text: `ERROR · ${name} — not an operation on this surface.` };
  }
  const host: OperationHost = {
    currentSession: () => session,
    context: (draft) => createOpContext(draft),
    emit,
    onRender,
  };
  return tool.execute(params, host);
}

export function toolUpdateDescription(
  session: LayoutSession,
  description: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const details = { operation: "update_description" };
  if (typeof description !== "string" || description.trim() === "") {
    return {
      isError: true,
      text: "update_description rejected: description must be a non-empty string.",
    };
  }
  if (session.draft.description === description) {
    return {
      text: "NO-OP · update_description — the board description already reads exactly this.",
      details,
    };
  }

  const previous = session.draft.description;
  session.draft = { ...session.draft, description };
  const label = "updateDescription";
  const diagnostics = runDiagnostics(session.draft);
  emit(session, {
    type: "proposal",
    sessionId: session.id,
    n: session.proposalCount,
  });
  emit(session, {
    type: "delta",
    sessionId: session.id,
    n: session.proposalCount,
    delta: label,
    lint: formatDiagnostics(diagnostics),
  });
  return {
    text: [
      `APPLIED · ${label}`,
      `DELTA · description ${previous === undefined ? "none" : previous.length} → ${description.length} chars`,
    ].join("\n"),
    details,
  };
}

/** Notify studio that the draft's annotation threads moved. */
function emitAnnotations(session: LayoutSession, emit: SessionEventSink): void {
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
  session.draft = { ...session.draft, annotations: [...annotations, annotation] };
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
    session.draft = {
      ...session.draft,
      annotations: session.draft.annotations?.map((annotation) =>
        annotation.id === entry.annotationId
          ? {
            ...annotation,
            replies: [...annotation.replies, reply],
            status: DISPOSITION_STATUS[status],
          }
          : annotation),
    };
    entry.replies = [...entry.replies, reply];
    emitAnnotations(session, emit);
  }

  return {
    text: formatRequestsBlock(session.requests),
    details: { id: entry.alias, status },
  };
}

export function toolFinalize(
  session: LayoutSession,
  outcome: "committed" | "none",
  message: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (outcome !== "committed" && outcome !== "none") {
    return { isError: true, text: 'finalize rejected: outcome must be "committed" or "none".' };
  }
  if (typeof message !== "string" || message.trim() === "") {
    return {
      isError: true,
      text: outcome === "committed"
        ? "finalize rejected: message must be a non-empty one-line summary of what you changed."
        : "finalize rejected: message must be a non-empty explanation for the operator.",
    };
  }

  if (outcome === "none") {
    session.status = "abandoned";
    emit(session, {
      type: "abandoned",
      sessionId: session.id,
      reason: message.trim(),
    });
    return {
      text: "Run ended without a proposal. The board is untouched.",
      details: { outcome },
    };
  }

  // The finishing registry adds the polish rules that would only nag mid-build.
  const diagnostics = runDiagnostics(session.draft, FINISHING_RULES);
  const scoped = scopedDiagnostics(session, diagnostics);
  const blocking = scoped.filter((diagnostic) => diagnostic.severity === "error");
  // A thread the agent opened is a question left for the user, answered on
  // their own time — it never gates the commit. User-authored requests do.
  const openRequests = session.requests.filter(
    (request) => request.status === "open" && request.createdBy !== "agent",
  );
  if (blocking.length > 0 || openRequests.length > 0) {
    return {
      isError: true,
      text: [
        "Finalize blocked; the run continues:",
        ...blocking.map((diagnostic) =>
          `- ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}`
          + (diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "")),
        ...openRequests.map((request) =>
          `- ${formatRequestLine(request)}  (dispose with resolve_request)`),
      ].join("\n"),
    };
  }

  const unresolvedWarnings = formatDiagnostics(
    scoped.filter((diagnostic) => diagnostic.severity === "warning"),
  );
  const operations = diffDocuments(session.baseline, session.draft);
  if (operations.length === 0 && session.proposal === null) {
    return { isError: true, text: "Nothing to commit — the draft matches the board." };
  }
  const proposal: AgentProposal = {
    n: Math.max(1, session.proposalCount),
    operations,
    summary: message.trim(),
    delta: operations.length > 0
      ? [
        "Document patch:",
        ...operations.map((operation) => `- ${describePatchOperation(operation)}`),
      ].join("\n")
      : "No changes.",
    lint: unresolvedWarnings,
  };
  session.proposal = proposal;
  session.status = "proposal-ready";
  emit(session, { type: "proposal-ready", sessionId: session.id, proposal });
  return {
    text: `Committed: ${proposal.summary} (${proposal.operations.length} patch operation${proposal.operations.length === 1 ? "" : "s"}). The proposal is now awaiting operator review.`,
    details: { outcome, operations: proposal.operations.length },
  };
}

export function createToolRuntime(host: LayoutToolHost): LayoutToolRuntime {
  const state = createLayoutToolState();
  const pushRender = (session: LayoutSession) => (png: Buffer) => {
    state.renderCount += 1;
    host.onRender(session.id, png, state.renderCount);
  };
  return {
    operation: (name, params) => {
      const session = host.currentSession();
      return toolOperation(session, name, params, host.emit, pushRender(session));
    },
    look: (view) => {
      const session = host.currentSession();
      return toolLook(session, view, pushRender(session));
    },
    updateDescription: (description) => {
      const session = host.currentSession();
      return toolUpdateDescription(session, description, host.emit);
    },
    addAnnotation: (objectId, body) => {
      const session = host.currentSession();
      return toolAddAnnotation(session, objectId, body, host.emit);
    },
    resolveRequest: (id, status, note) =>
      toolResolveRequest(host.currentSession(), id, status, note, host.emit),
    finalize: (outcome, message) =>
      toolFinalize(host.currentSession(), outcome, message, host.emit),
  };
}
