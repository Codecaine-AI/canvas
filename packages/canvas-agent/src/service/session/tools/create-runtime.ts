/**
 * `createToolRuntime` — binds the tool implementations to the store's current
 * session, resolving "which layout session am I?" through a `LayoutToolHost`
 * so every tool body can just take a session. Also `toolOperation`, the
 * dispatch that resolves a gesture name back to its descriptor and runs the
 * operation pipeline.
 */
import type { AgentSessionEvent } from "../../../protocol";
import type { SessionEventSink } from "../perception/perception";
import type { LayoutSession } from "../store";
import { findOperationTool } from "./operations";
import { createOpContext } from "./operations/op-context";
import type { OperationHost } from "./operations/operation-tool";
import type { LayoutToolRenderResult, LayoutToolRuntime } from "./runtime";
import { toolAddAnnotation } from "./workflow/add-annotation";
import { toolFinalize } from "./workflow/finalize";
import { toolLook } from "./workflow/look";
import { toolReplyAnnotation } from "./workflow/reply-annotation";
import { toolResolveRequest } from "./workflow/resolve-request";
import { toolSetBoardTitle } from "./workflow/set-board-title";
import { toolUpdateDescription } from "./workflow/update-description";

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
 *
 * There is no render sink here: an edit returns text, while the operation
 * pipeline eagerly refreshes the session's current-board raster. `look`
 * produces requested close-ups and crops in its own result.
 */
export function toolOperation(
  session: LayoutSession,
  name: string,
  params: Record<string, unknown>,
  emit: SessionEventSink,
): LayoutToolRenderResult {
  const tool = findOperationTool(name);
  if (!tool) {
    return { isError: true, text: `ERROR · ${name} — not an operation on this surface.` };
  }
  const host: OperationHost = {
    currentSession: () => session,
    context: (draft) => createOpContext(draft),
    emit,
  };
  return tool.execute(params, host);
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
      return toolOperation(session, name, params, host.emit);
    },
    look: (request) => {
      const session = host.currentSession();
      return toolLook(session, request, pushRender(session));
    },
    updateDescription: (description) => {
      const session = host.currentSession();
      return toolUpdateDescription(session, description, host.emit);
    },
    setBoardTitle: (title) => {
      const session = host.currentSession();
      return toolSetBoardTitle(session, title, host.emit);
    },
    addAnnotation: (objectId, body) => {
      const session = host.currentSession();
      return toolAddAnnotation(session, objectId, body, host.emit);
    },
    replyAnnotation: (id, body) => {
      const session = host.currentSession();
      return toolReplyAnnotation(session, id, body, host.emit);
    },
    resolveRequest: (id, status, note) =>
      toolResolveRequest(host.currentSession(), id, status, note, host.emit),
    finalize: (outcome, message) =>
      toolFinalize(host.currentSession(), outcome, message, host.emit),
  };
}
