/**
 * A sticky text style change refits the board's card notes in one undo step
 * (InteractiveCanvasEditor, objects/sticky/note-fit.ts).
 */
import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { noteNeededHeight } from "../../../objects/sticky/note-fit";
import { canvasThemePreset } from "../../../theme/canvas-style";
import { InteractiveCanvasEditor } from "../InteractiveCanvasEditor";

afterEach(() => cleanup());

const board: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "note-style-refit",
  mode: "diagram",
  objects: [
    {
      id: "note",
      type: "sticky",
      text: "one\ntwo\nthree",
      color: "yellow",
      geometry: { x: 80, y: 80, width: 240, height: 100 },
      style: { shape: "note" },
    },
  ],
  connections: [],
};

const SMALL = { theme: "schematic-light", stickyFontSizePx: 16, stickyLineHeightPx: 24 } as const;
const LARGE = { theme: "schematic-light", stickyFontSizePx: 32, stickyLineHeightPx: 48 } as const;

describe("InteractiveCanvasEditor · sticky text style change", () => {
  it("refits every card note to the new text size, and one undo restores it", () => {
    const onDocumentChange = mock((_document: InteractiveCanvasDocument) => {});
    const view = render(<InteractiveCanvasEditor document={board} canvasStyle={SMALL} onDocumentChange={onDocumentChange} />);
    // Opening the board does not refit it.
    expect(onDocumentChange).not.toHaveBeenCalled();

    view.rerender(<InteractiveCanvasEditor document={board} canvasStyle={LARGE} onDocumentChange={onDocumentChange} />);
    const refit = onDocumentChange.mock.calls.at(-1)![0].objects[0]!;
    const needed = noteNeededHeight(refit, { ...canvasThemePreset("schematic-light"), ...LARGE })!;
    expect(needed).toBeGreaterThan(100);
    expect(refit.geometry).toEqual({ x: 80, y: 80, width: 240, height: needed });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
    });
    expect(onDocumentChange.mock.calls.at(-1)![0].objects[0]!.geometry.height).toBe(100);
  });
});
