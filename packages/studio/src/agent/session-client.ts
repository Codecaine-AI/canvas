import type {
  AcceptAgentSessionResponse,
  AgentSessionEvent,
  AgentSessionMessageRequest,
  AgentSessionStatus,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
} from "@codecaine-ai/canvas-agent/protocol";

export type CreateSessionBody = Omit<CreateAgentSessionRequest, "canvasId">;

export interface SendMessageResponse {
  ok: true;
  status: AgentSessionStatus;
}

export interface RejectSessionResponse {
  ok: true;
}

export type AgentSessionClientErrorKind =
  | "conflict"
  | "harness-unavailable"
  | "request-failed";

/** A non-successful response from the studio's agent proxy. */
export class AgentSessionClientError extends Error {
  readonly name = "AgentSessionClientError";

  constructor(
    message: string,
    readonly status: number,
    readonly kind: AgentSessionClientErrorKind,
  ) {
    super(message);
  }
}

export interface AgentSessionEventHandlers {
  /** Called on the initial connection and every EventSource reconnect. */
  onReset(): void;
  onEvent(event: AgentSessionEvent): void;
  onError?(error: unknown): void;
}

const SESSION_MESSAGE_EVENT_TYPES = {
  fitted: true,
  proposal: true,
  delta: true,
  rendering: true,
  "proposal-ready": true,
  abandoned: true,
  status: true,
} satisfies Record<Exclude<AgentSessionEvent["type"], "error">, true>;

function sessionsUrl(canvasId: string): string {
  return `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions`;
}

function sessionUrl(canvasId: string, sessionId: string): string {
  return `${sessionsUrl(canvasId)}/${encodeURIComponent(sessionId)}`;
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const text = (await response.text()).trim();
  if (!text) return fallback;

  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Some upstream failures are plain text rather than the proxy's JSON shape.
  }

  return text;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const kind: AgentSessionClientErrorKind =
      response.status === 409
        ? "conflict"
        : response.status === 502
          ? "harness-unavailable"
          : "request-failed";
    throw new AgentSessionClientError(
      await errorMessage(response),
      response.status,
      kind,
    );
  }
  return (await response.json()) as T;
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function createSession(
  canvasId: string,
  body: CreateSessionBody,
): Promise<CreateAgentSessionResponse> {
  const request: CreateAgentSessionRequest = { ...body, canvasId };
  return postJson<CreateAgentSessionResponse>(sessionsUrl(canvasId), request);
}

export function sendMessage(
  canvasId: string,
  sessionId: string,
  body: AgentSessionMessageRequest,
): Promise<SendMessageResponse> {
  return postJson<SendMessageResponse>(`${sessionUrl(canvasId, sessionId)}/message`, body);
}

export function accept(
  canvasId: string,
  sessionId: string,
): Promise<AcceptAgentSessionResponse> {
  return postJson<AcceptAgentSessionResponse>(`${sessionUrl(canvasId, sessionId)}/accept`);
}

export function reject(
  canvasId: string,
  sessionId: string,
): Promise<RejectSessionResponse> {
  return postJson<RejectSessionResponse>(`${sessionUrl(canvasId, sessionId)}/reject`);
}

export function subscribe(
  canvasId: string,
  sessionId: string,
  handlers: AgentSessionEventHandlers,
): () => void {
  const source = new EventSource(`${sessionUrl(canvasId, sessionId)}/events`);

  source.addEventListener("open", () => {
    handlers.onReset();
  });

  const dispatchMessage = (type: AgentSessionEvent["type"], data: string) => {
    try {
      const event = JSON.parse(data) as AgentSessionEvent;
      if (event.type !== type) {
        throw new Error(`Expected ${type} event, received ${event.type}.`);
      }
      handlers.onEvent(event);
    } catch (error) {
      handlers.onError?.(error);
    }
  };

  for (const type of Object.keys(SESSION_MESSAGE_EVENT_TYPES) as Array<
    Exclude<AgentSessionEvent["type"], "error">
  >) {
    source.addEventListener(type, (message) => {
      dispatchMessage(type, (message as MessageEvent<string>).data);
    });
  }

  source.addEventListener("error", (event) => {
    // The protocol's named `error` SSE shares a browser event name with
    // EventSource transport failures. Only SSE messages carry `data`.
    if ("data" in event && typeof event.data === "string") {
      dispatchMessage("error", event.data);
    } else {
      handlers.onError?.(event);
    }
  });

  return () => {
    source.close();
  };
}
