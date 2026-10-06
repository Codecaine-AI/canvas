/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CanvasStyleProvider, type InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import { canvasThemePreset } from "@codecaine-ai/canvas/style";
import type { AgentProposal } from "@codecaine-ai/canvas-agent/protocol";
import { flat } from "@codecaine-ai/design-system";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GhostPreviewLayer } from ".";
import { markColors } from "./utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const baselineDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "ghost-marks",
  mode: "diagram",
  objects: [
    { id: "moved", type: "process", text: "Moved", parentId: null, geometry: { x: 10, y: 20, width: 100, height: 80 } },
    { id: "removed", type: "process", text: "Removed", parentId: null, geometry: { x: 400, y: 40, width: 80, height: 60 } },
  ],
  connections: [],
};

const proposal: AgentProposal = {
  n: 1,
  summary: "Tidy",
  delta: "",
  lint: "",
  operations: [
    { type: "updateObject", objectId: "moved", patch: { geometry: { x: 30, y: 50, width: 100, height: 80 } } },
    {
      type: "addObject",
      object: { id: "created", type: "sticky", text: "New", geometry: { x: 600, y: 70, width: 160, height: 120 } },
    },
    { type: "removeObject", objectId: "removed" },
  ],
};

let container: HTMLDivElement;
let root: Root;
const realFetch = globalThis.fetch;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  globalThis.fetch = (async () =>
    new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>')) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = realFetch;
  document.documentElement.removeAttribute("data-theme");
});

async function renderMarks(theme: "schematic-light" | "schematic-dark") {
  await act(async () => {
    root.render(
      <CanvasStyleProvider value={{ theme }}>
        <GhostPreviewLayer
          canvasId="board"
          sessionId="session-1"
          refreshSignal={0}
          baselineDocument={baselineDocument}
          proposal={proposal}
          workFrame={{ x: 0, y: 0, width: 800, height: 600 }}
        />
      </CanvasStyleProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const mark = (name: string) => container.querySelector<HTMLElement>(`[data-agent-change="${name}"]`)!;
  return {
    frame: container.querySelector<HTMLElement>('[data-agent-work-frame="true"]')!,
    newBadge: mark("new-badge"),
    removedBadge: mark("removed-badge"),
  };
}

const lower = (value: string) => value.toLowerCase();

describe("GhostPreviewLayer marks", () => {
  // The app theme is dark in both cases: the marks follow the board, not the app (decision 56).
  it("takes the light tokens and the board surface over a light board, whatever the app theme", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { frame, newBadge, removedBadge } = await renderMarks("schematic-light");
    const light = flat.light;
    expect(lower(frame.style.border)).toContain(lower(light["color.annotation.accent"]));
    expect(lower(newBadge.style.background)).toContain(lower(light["color.annotation.accent"]));
    expect(lower(newBadge.style.color)).toContain(lower(light["color.text.on-solid"]));
    expect(lower(removedBadge.style.background)).toContain(lower(light["color.diff.del"]));
    expect(newBadge.style.boxShadow).toBe("");
  });

  // happy-dom drops color-mix(), so the veil's color is checked on the resolved mark colors.
  it("veils a moved object's old place in the board's own surface", () => {
    expect(markColors(canvasThemePreset("schematic-light")).surface).toBe(canvasThemePreset("schematic-light").boardBackground);
    expect(markColors(canvasThemePreset("schematic-dark")).surface).toBe(canvasThemePreset("schematic-dark").boardBackground);
    expect(markColors(canvasThemePreset("schematic-dark")).agent).toBe(flat.dark["color.annotation.accent"]);
  });

  it("takes the dark tokens over a dark board", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { frame, newBadge, removedBadge } = await renderMarks("schematic-dark");
    const dark = flat.dark;
    expect(lower(frame.style.border)).toContain(lower(dark["color.annotation.accent"]));
    expect(lower(newBadge.style.color)).toContain(lower(dark["color.text.on-solid"]));
    expect(lower(removedBadge.style.background)).toContain(lower(dark["color.diff.del"]));
  });
});
