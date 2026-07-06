import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "../../model/actions";
import { InteractiveCanvasEditor } from "../../editor/InteractiveCanvasEditor";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "../../model/schema";

afterEach(() => {
  cleanup();
});

/**
 * W4 blocker: connections carry an additive `color?: string` (any non-empty
 * string; hex expected) that round-trips through schema validation, is
 * patchable via canvas.updateConnection, and is wired to the connector
 * selection toolbar's color flyout.
 */

function makeDocument(color?: string): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "connection-color-doc",
    mode: "diagram",
    objects: [
      { id: "a", type: "process", label: "A", geometry: { x: 40, y: 40, width: 160, height: 96 } },
      { id: "b", type: "process", label: "B", geometry: { x: 440, y: 40, width: 160, height: 96 } },
    ],
    connections: [
      {
        id: "connection-a",
        from: { objectId: "a", anchor: "right" },
        to: { objectId: "b", anchor: "left" },
        style: "solid",
        arrow: "forward",
        ...(color ? { color } : {}),
      },
    ],
  };
}

describe("schema: connection color round-trip", () => {
  it("keeps a valid color string through validation", () => {
    const result = validateInteractiveCanvasDocument(makeDocument("#EB7500"));
    if (!result.ok) throw new Error("expected valid document");
    expect(result.document.connections[0]!.color).toBe("#EB7500");
  });

  it("drops an empty/whitespace color and leaves absent colors absent", () => {
    const raw = makeDocument() as unknown as Record<string, unknown>;
    (raw.connections as Array<Record<string, unknown>>)[0]!.color = "   ";
    const result = validateInteractiveCanvasDocument(raw);
    if (!result.ok) throw new Error("expected valid document");
    expect(result.document.connections[0]!.color).toBeUndefined();

    const absent = validateInteractiveCanvasDocument(makeDocument());
    if (!absent.ok) throw new Error("expected valid document");
    expect(absent.document.connections[0]!.color).toBeUndefined();
  });
});

describe("actions: canvas.updateConnection color patch", () => {
  it("updates the connection's color and preserves everything else", () => {
    const state = createInteractiveCanvasState(makeDocument());
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { color: "#3E9B4B" },
    });
    const connection = next.document.connections[0]!;
    expect(connection.color).toBe("#3E9B4B");
    expect(connection.from).toEqual({ objectId: "a", anchor: "right" });
    expect(connection.to).toEqual({ objectId: "b", anchor: "left" });
    expect(connection.style).toBe("solid");
  });
});

describe("editor: connector color flyout (selection toolbar)", () => {
  function stubStageRect() {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
  }

  it("selecting a connector and picking a swatch patches {color} onto the connection", async () => {
    const restoreRect = stubStageRect();
    try {
      const saved: InteractiveCanvasDocument[] = [];
      const { container } = render(
        <InteractiveCanvasEditor
          document={makeDocument()}
          onSave={(document) => {
            saved.push(document);
          }}
          onCancel={() => undefined}
        />,
      );

      // Select the connector by clicking its wide hit path (pointer-up goes to
      // window — the editor's gesture-end listener lives there).
      const hitPath = container.querySelector('[data-canvas-connection-id="connection-a"]')!;
      expect(hitPath).toBeTruthy();
      await act(async () => {
        fireEvent.pointerDown(hitPath, { pointerId: 1, button: 0, clientX: 320, clientY: 88 });
        fireEvent.pointerUp(window, { pointerId: 1, clientX: 320, clientY: 88 });
      });

      // The connector selection toolbar appears; open the "Line color" flyout.
      const colorButton = await screen.findByRole("button", { name: "Line color" });
      fireEvent.click(colorButton);

      // The connector palette shows the sampled FigJam connector colors.
      const popover = container.querySelector("[data-color-palette-popover]")!;
      expect(popover).toBeTruthy();
      const orange = popover.querySelector('[data-color="#EB7500"]')!;
      expect(orange).toBeTruthy();
      fireEvent.click(orange);

      // The patch landed: saving round-trips the color onto the document.
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      expect(saved.length).toBe(1);
      expect(saved[0]!.connections[0]!.color).toBe("#EB7500");
    } finally {
      restoreRect();
    }
  });
});
