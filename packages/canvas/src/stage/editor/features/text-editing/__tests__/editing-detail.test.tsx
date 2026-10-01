/**
 * The in-place name editor with a detail line (contract §4): the detail is not
 * edited in place (the Inspector edits it), but it keeps painting under the
 * textarea exactly as it does at rest — so a centered name + detail block
 * stays put when editing starts, and the textarea sits exactly over the
 * at-rest name. The textarea and the line take the canvas style's typography.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { objectDefFor } from "../../../../../objects/object-def";
import { resolveTextSlot } from "../../../../../objects/text-slots";
import { CanvasStyleProvider } from "../../../../../theme/canvas-style-context";
import { canvasThemePreset, type CanvasThemeId } from "../../../../../theme/canvas-style";
import { ObjectShape } from "../../../../ObjectShape";
import type { InteractiveCanvasObject } from "../../../../../state/schema";
import { TextEditingOverlay } from "../TextEditingOverlay";
import type { TextEditingApi } from "../use-text-editing";

afterEach(() => {
  cleanup();
});

function apiFor(target: InteractiveCanvasObject, value?: string): TextEditingApi {
  const noop = () => {};
  return {
    labelEditConnectionId: null,
    labelEditValue: "",
    setLabelEditValue: noop,
    labelEditPoint: null,
    openConnectionLabelEditor: noop,
    commitConnectionLabel: noop,
    cancelConnectionLabelEdit: noop,
    objectTextEditId: target.id,
    setObjectTextEditId: noop,
    objectTextEditValue: value ?? target.text,
    setObjectTextEditValue: noop,
    objectTextEditTarget: target,
    openObjectTextEditor: noop,
    commitObjectText: noop,
    cancelObjectTextEdit: noop,
  };
}

const SHAPE: InteractiveCanvasObject = {
  id: "s1",
  type: "process",
  text: "Run Executor LLM",
  detail: "Function Calling LLM",
  parentId: null,
  geometry: { x: 100, y: 200, width: 240, height: 80 },
  style: { shape: "rounded-rect" },
  color: "blue",
};

const ICON: InteractiveCanvasObject = {
  id: "i1",
  type: "icon",
  icon: "database",
  text: "Orders DB",
  detail: "postgres 16",
  parentId: null,
  geometry: { x: 100, y: 200, width: 64, height: 64 },
  style: { shape: "icon" },
  color: "violet",
};

function renderBoth(object: InteractiveCanvasObject, theme: CanvasThemeId, value?: string) {
  const style = canvasThemePreset(theme);
  const view = render(
    <CanvasStyleProvider value={style}>
      <ObjectShape object={object} selected={false} changed={false} bounds={{ minX: 0, minY: 0, maxX: 2000, maxY: 2000 }} />
      <TextEditingOverlay textEditing={apiFor(object, value)} zoom={1} />
    </CanvasStyleProvider>,
  );
  const atRest = view.container.querySelector<HTMLElement>("[data-canvas-object-id] [data-canvas-text-slot]")!;
  const editor = view.container.querySelector<HTMLElement>("[data-canvas-text-editor]")!;
  return { style, atRest, editor };
}

describe("the in-place name editor over a detail line", () => {
  for (const theme of ["figjam", "schematic-light", "schematic-dark"] as const) {
    it(`${theme}: the editor takes the at-rest slot's world rect and paints the same detail line`, () => {
      for (const object of [SHAPE, ICON]) {
        const { style, atRest, editor } = renderBoth(object, theme);
        const resolved = resolveTextSlot(objectDefFor(object)!.textSlot!, object, 1, { canvasStyle: style });
        expect(resolved.detail).not.toBeNull();
        // Compared as numbers: the DOM serializes a CSS length to fewer digits
        // than a float sum prints (a 56px tile centers the icon band at x −14.2).
        expect(parseFloat(editor.style.left)).toBeCloseTo(object.geometry.x + resolved.rect.x, 9);
        expect(parseFloat(editor.style.top)).toBeCloseTo(object.geometry.y + resolved.rect.y, 9);
        expect(editor.style.width).toBe(atRest.style.width);
        expect(editor.style.height).toBe(atRest.style.height);
        expect(editor.style.justifyContent).toBe(atRest.style.justifyContent);

        const restDetail = atRest.querySelector<HTMLElement>("[data-canvas-text-detail]")!;
        const editDetail = editor.querySelector<HTMLElement>("[data-canvas-text-detail]")!;
        expect(editDetail.textContent).toBe(restDetail.textContent);
        expect(editDetail.getAttribute("style")).toBe(restDetail.getAttribute("style"));
        // The detail follows the textarea, as it follows the name at rest.
        expect(editor.querySelector("textarea")!.nextElementSibling).toBe(editDetail);

        const textarea = editor.querySelector<HTMLTextAreaElement>("textarea")!;
        const label = atRest.querySelector<HTMLElement>(".interactive-canvas-object-label")!;
        expect(textarea.style.color).toBe(label.style.color);
        expect(textarea.style.fontWeight).toBe(label.style.fontWeight);
        expect(textarea.style.fontWeight).toBe(String(style.textFontWeight));
        cleanup();
      }
    });
  }

  it("keeps the detail line while the draft name changes, and the below band tracks the draft", () => {
    const { editor } = renderBoth(ICON, "schematic-light", "A much longer caption that wraps onto more lines");
    expect(editor.querySelector("[data-canvas-text-detail]")!.textContent).toBe("postgres 16");
    const resolved = resolveTextSlot(objectDefFor(ICON)!.textSlot!, ICON, 1, {
      canvasStyle: canvasThemePreset("schematic-light"),
      draftText: "A much longer caption that wraps onto more lines",
    });
    expect(editor.style.height).toBe(`${resolved.rect.height}px`);
    expect(resolved.rect.height).toBeGreaterThan(18 + 3 + 14 * 1.3);
  });

  it("paints no detail line in the editor for objects without one", () => {
    const { editor } = renderBoth({ ...SHAPE, detail: undefined }, "schematic-light");
    expect(editor.querySelector("[data-canvas-text-detail]")).toBeNull();
  });
});
