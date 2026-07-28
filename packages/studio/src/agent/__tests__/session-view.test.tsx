/// <reference types="bun" />

import { afterEach, describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentSidebar } from "../AgentSidebar";
import { SessionView, type SessionViewProps } from "../SessionView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const baselineDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "render-viewer-test",
  mode: "diagram",
  objects: [],
  connections: [],
};

const deltaEvent = {
  type: "delta" as const,
  sessionId: "session/#1",
  n: 7,
  delta: "Moved the checkout card.",
  lint: "Clean",
};

function sessionProps(): SessionViewProps {
  return {
    status: "running",
    canvasId: "board / one",
    sessionId: deltaEvent.sessionId,
    attempts: [
      {
        instruction: "Tidy the checkout flow",
        events: [deltaEvent],
      },
    ],
    baselineDocument,
    proposal: null,
    lastGoodProposal: null,
    onRefine: () => undefined,
    onAccept: () => undefined,
    onReject: () => undefined,
    onRetry: () => undefined,
    onClose: () => undefined,
    onDiscardConflict: () => undefined,
    onTryAgainOnCurrentBoard: () => undefined,
  };
}

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderNode(node: ReactNode): void {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mountedRoots.push({ container, root });
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function image(alt: string): HTMLImageElement {
  const match = Array.from(document.querySelectorAll<HTMLImageElement>("img")).find(
    (candidate) => candidate.alt === alt,
  );
  if (!match) throw new Error(`Image not found: ${alt}`);
  return match;
}

afterEach(() => {
  act(() => {
    for (const { container, root } of mountedRoots.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("SessionView render affordances", () => {
  it("opens the operation render at the encoded URL only after its delta affordance is clicked", () => {
    renderNode(<SessionView {...sessionProps()} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => button("View render after operation 7").click());

    expect(image("Board after operation 7").getAttribute("src")).toBe(
      "/api/canvases/board%20%2F%20one/agent/sessions/session%2F%231/renders/7.png",
    );
  });

  it("shows a quiet unavailable state when an operation render cannot be loaded", () => {
    renderNode(<SessionView {...sessionProps()} />);
    act(() => button("View render after operation 7").click());
    act(() => {
      image("Board after operation 7").dispatchEvent(new Event("error"));
    });

    expect(document.querySelector("[data-agent-render-unavailable]")?.textContent).toBe(
      "Render no longer available",
    );
    expect(
      Array.from(document.querySelectorAll("img")).some(
        (candidate) => candidate.alt === "Board after operation 7",
      ),
    ).toBe(false);
  });

  it("opens the current board render from the compact session-header button", () => {
    const { status: _status, ...session } = sessionProps();
    renderNode(
      <AgentSidebar
        status="running"
        onClose={() => undefined}
        queue={{
          notes: [],
          onRemoveNote: () => undefined,
          onPanToNote: () => undefined,
          onAddNote: () => undefined,
          onRun: () => undefined,
        }}
        session={session}
      />,
    );

    act(() => button("View current board").click());

    expect(image("Current board").getAttribute("src")).toBe(
      "/api/canvases/board%20%2F%20one/agent/sessions/session%2F%231/board.png",
    );
  });
});
