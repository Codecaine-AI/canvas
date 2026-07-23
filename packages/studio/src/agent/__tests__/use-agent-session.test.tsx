/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type {
  AcceptAgentSessionResponse,
  AgentProposal,
  AgentSessionEvent,
} from "@codecaine-ai/canvas-agent/protocol";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas";

import type {
  AgentSessionClientErrorKind,
  AgentSessionEventHandlers,
  CreateSessionBody,
} from "../session-client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MockAgentSessionClientError extends Error {
  readonly name = "AgentSessionClientError";

  constructor(
    message: string,
    readonly status: number,
    readonly kind: AgentSessionClientErrorKind,
  ) {
    super(message);
  }
}

let handlers: AgentSessionEventHandlers | null = null;
const unsubscribeMock = mock(() => {});
const createSessionMock = mock(async (_canvasId: string, _body: CreateSessionBody) => ({
  sessionId: "session-1",
  baselineHash: "baseline-1",
  containerId: "container-1",
}));
const sendMessageMock = mock(async () => ({
  ok: true as const,
  status: "running" as const,
}));
const acceptMock = mock(async (): Promise<AcceptAgentSessionResponse> => ({
  operations: [],
  summary: "Arranged the board",
  rebased: false,
}));
const rejectMock = mock(async () => ({ ok: true as const }));
const subscribeMock = mock(
  (
    _canvasId: string,
    _sessionId: string,
    nextHandlers: AgentSessionEventHandlers,
  ) => {
    handlers = nextHandlers;
    return unsubscribeMock;
  },
);

mock.module("../session-client", () => ({
  AgentSessionClientError: MockAgentSessionClientError,
  createSession: createSessionMock,
  sendMessage: sendMessageMock,
  accept: acceptMock,
  reject: rejectMock,
  subscribe: subscribeMock,
}));

const {
  ACCEPT_CONFLICT_MESSAGE,
  useAgentSession,
} = await import("../use-agent-session");
type SessionHookResult = ReturnType<typeof useAgentSession>;

const mountedRoots: Root[] = [];

function renderSessionHook(options: Parameters<typeof useAgentSession>[0]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let current: SessionHookResult | null = null;

  function Probe() {
    current = useAgentSession(options);
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });
  mountedRoots.push(root);

  return {
    result: {
      get current(): SessionHookResult {
        if (!current) throw new Error("The hook did not render.");
        return current;
      },
    },
  };
}

const proposal: AgentProposal = {
  n: 1,
  operations: [
    {
      type: "updateObject",
      objectId: "card-a",
      patch: { geometry: { x: 20, y: 30, width: 120, height: 80 } },
    },
  ],
  summary: "Moved one card",
  delta: "Moved card A into place.",
  lint: "",
};

const payload: CreateSessionBody = {
  scopeObjectIds: ["section-a"],
  instruction: "Apply the pinned notes.",
  annotations: [
    {
      id: "note-a",
      intent: "agent-request",
      body: "Move the card",
      target: { kind: "object", objectId: "card-a" },
    },
  ],
};

function event(value: AgentSessionEvent): void {
  if (!handlers) throw new Error("The hook has not subscribed yet.");
  handlers.onEvent(value);
}

function setup() {
  const beforeStart = mock(async () => {});
  const dispatchAgentPatch = mock(() => {});
  const view = renderSessionHook({
    canvasId: "board-a",
    beforeStart,
    dispatchAgentPatch,
  });
  return { view, beforeStart, dispatchAgentPatch };
}

describe("useAgentSession", () => {
  beforeEach(() => {
    handlers = null;
    unsubscribeMock.mockClear();
    createSessionMock.mockClear();
    sendMessageMock.mockClear();
    acceptMock.mockClear();
    rejectMock.mockClear();
    subscribeMock.mockClear();
    createSessionMock.mockImplementation(async () => ({
      sessionId: "session-1",
      baselineHash: "baseline-1",
      containerId: "container-1",
    }));
    sendMessageMock.mockImplementation(async () => ({
      ok: true as const,
      status: "running" as const,
    }));
    acceptMock.mockImplementation(async () => ({
      operations: proposal.operations,
      summary: proposal.summary,
      rebased: false,
    }));
    rejectMock.mockImplementation(async () => ({ ok: true as const }));
  });

  afterEach(() => {
    act(() => {
      for (const root of mountedRoots.splice(0)) root.unmount();
    });
  });

  it("runs through proposal-ready and atomically applies the proposal with its notes", async () => {
    const { view, beforeStart, dispatchAgentPatch } = setup();

    await act(async () => {
      await view.result.current.start(payload);
    });

    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith("board-a", payload);
    expect(view.result.current.status).toBe("running");
    expect(view.result.current.sessionId).toBe("session-1");

    act(() => {
      handlers?.onReset();
      event({
        type: "fitted",
        sessionId: "session-1",
        program: "section-a := row(card-a)",
        frame: { x: 0, y: 0, width: 400, height: 240 },
        scopeObjectIds: ["section-a", "card-a"],
        boundaryArrowCount: 0,
      });
      event({ type: "proposal-ready", sessionId: "session-1", proposal });
    });

    expect(view.result.current.status).toBe("proposal-ready");
    expect(view.result.current.proposal).toEqual(proposal);
    expect(view.result.current.lastGoodProposal).toEqual(proposal);
    expect(view.result.current.events).toHaveLength(2);

    // Reconnects clear the old log before the server replays its full buffer.
    act(() => {
      handlers?.onReset();
      event({ type: "proposal-ready", sessionId: "session-1", proposal });
    });
    expect(view.result.current.events).toHaveLength(1);

    let accepted: unknown = null;
    await act(async () => {
      accepted = await view.result.current.accept();
    });

    const expectedOperations: CanvasAgentPatchOperation[] = [
      {
        type: "updateObject",
        objectId: "card-a",
        patch: { geometry: { x: 20, y: 30, width: 120, height: 80 } },
      },
      { type: "removeAnnotation", annotationId: "note-a" },
    ];
    const expectedResult = {
      operations: expectedOperations,
      summary: "Moved one card",
      rebased: false,
    };
    expect(accepted).toEqual(expectedResult);
    expect(dispatchAgentPatch).toHaveBeenCalledWith(
      expectedOperations,
      "Moved one card",
    );
    expect(view.result.current.status).toBe("accepted");
    expect(view.result.current.acceptedResult).toEqual(expectedResult);
  });

  it("keeps the last good proposal when a follow-up is abandoned", async () => {
    const { view } = setup();
    await act(async () => {
      await view.result.current.start(payload);
    });
    act(() => {
      event({ type: "proposal-ready", sessionId: "session-1", proposal });
    });

    await act(async () => {
      await view.result.current.refine("Put the cards into columns");
    });
    act(() => {
      event({
        type: "status",
        sessionId: "session-1",
        status: "running",
      });
      event({
        type: "abandoned",
        sessionId: "session-1",
        reason: "No arrangement fit inside the section.",
      });
    });

    expect(view.result.current.status).toBe("proposal-ready");
    expect(view.result.current.proposal).toBeNull();
    expect(view.result.current.lastGoodProposal).toEqual(proposal);
    expect(view.result.current.abandonment).toEqual({
      reason: "No arrangement fit inside the section.",
      attemptNumber: 2,
      fallbackProposalNumber: 1,
    });
    expect(view.result.current.attempts).toHaveLength(2);
    expect(view.result.current.attempts[1]?.instruction).toBe(
      "Put the cards into columns",
    );
  });

  it("surfaces an accept conflict with discard and current-board retry intents", async () => {
    acceptMock.mockImplementationOnce(async () => {
      throw new MockAgentSessionClientError(
        "Scope object card-a moved.",
        409,
        "conflict",
      );
    });
    const { view, dispatchAgentPatch } = setup();
    await act(async () => {
      await view.result.current.start(payload);
    });
    act(() => {
      event({ type: "proposal-ready", sessionId: "session-1", proposal });
    });

    await act(async () => {
      expect(await view.result.current.accept()).toBeNull();
    });

    expect(view.result.current.status).toBe("proposal-ready");
    expect(view.result.current.acceptConflict).toEqual({
      message: ACCEPT_CONFLICT_MESSAGE,
      detail: "Scope object card-a moved.",
      actions: [
        { intent: "discard", label: "Discard" },
        {
          intent: "retry-current-board",
          label: "Try again on the current board",
        },
      ],
    });
    expect(dispatchAgentPatch).not.toHaveBeenCalled();
  });
});
