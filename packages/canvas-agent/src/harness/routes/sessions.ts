/**
 * Layout session routes (HARNESS-SETUP-PLAN §4) — the studio-proxied session
 * surface:
 *
 *   POST /api/canvases/:id/agent/sessions              create + spawn
 *   GET  /api/canvases/:id/agent/sessions/:sid/events  SSE stream
 *   POST /api/canvases/:id/agent/sessions/:sid/message refine (same session)
 *   POST /api/canvases/:id/agent/sessions/:sid/accept  rebase-check → ops | 409
 *   POST /api/canvases/:id/agent/sessions/:sid/reject  discard
 *   GET  /api/canvases/:id/agent/sessions/:sid/draft.svg
 */
import { Elysia } from "elysia";

import type {
  AgentSessionMessageRequest,
  CreateAgentSessionRequest,
} from "../../protocol";
import { HttpError, type LayoutSessionStore } from "../session-store";

function errorBody(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message } };
  }
  console.error("canvas-agent session route error:", error);
  return {
    status: 500,
    body: { error: error instanceof Error ? error.message : String(error) },
  };
}

export function createSessionRoutes(store: LayoutSessionStore) {
  const base = "/api/canvases/:id/agent/sessions";

  /** Sessions are addressed globally; the :id segment must still agree. */
  const resolve = (canvasId: string, sessionId: string) => {
    const session = store.get(sessionId);
    if (session.canvasId !== canvasId) {
      throw new HttpError(404, `Session ${sessionId} does not belong to canvas ${canvasId}.`);
    }
    return session;
  };

  return new Elysia()
    .post(base, async ({ params, body, set }) => {
      try {
        const input = (typeof body === "object" && body !== null ? body : {}) as Partial<CreateAgentSessionRequest>;
        const session = await store.createSession({
          canvasId: params.id,
          scopeObjectIds: input.scopeObjectIds ?? [],
          instruction: input.instruction ?? "",
          annotations: input.annotations,
          viewport: input.viewport,
          baselineHash: input.baselineHash,
        });
        return {
          sessionId: session.id,
          baselineHash: session.baselineHash,
          containerId: session.containerId,
        };
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    })
    .get(`${base}/:sid`, ({ params, set }) => {
      try {
        return store.stateOf(resolve(params.id, params.sid));
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    })
    .get(`${base}/:sid/events`, ({ params, set }) => {
      try {
        resolve(params.id, params.sid);
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
      const encoder = new TextEncoder();
      let unsubscribe: (() => void) | null = null;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(encoder.encode(": connected\n\n"));
          unsubscribe = store.subscribe(params.sid, (event) => {
            try {
              controller.enqueue(
                encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              unsubscribe?.();
            }
          });
        },
        cancel: () => {
          unsubscribe?.();
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    })
    .post(`${base}/:sid/message`, ({ params, body, set }) => {
      try {
        resolve(params.id, params.sid);
        const input = (typeof body === "object" && body !== null ? body : {}) as Partial<AgentSessionMessageRequest>;
        const session = store.message(params.sid, input.instruction ?? "", {
          annotations: input.annotations,
          viewport: input.viewport,
        });
        return { ok: true, status: session.status };
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    })
    .post(`${base}/:sid/accept`, ({ params, set }) => {
      try {
        resolve(params.id, params.sid);
        return store.accept(params.sid);
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    })
    .post(`${base}/:sid/reject`, ({ params, set }) => {
      try {
        resolve(params.id, params.sid);
        store.reject(params.sid);
        return { ok: true };
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    })
    .get(`${base}/:sid/draft.svg`, ({ params, set }) => {
      try {
        resolve(params.id, params.sid);
        const rendered = store.draftSvg(params.sid);
        return new Response(rendered.svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      } catch (error) {
        const { status, body: payload } = errorBody(error);
        set.status = status;
        return payload;
      }
    });
}
