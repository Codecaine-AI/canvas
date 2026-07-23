/**
 * Editing-position tests (P2, D14): the in-place editor must sit EXACTLY on
 * the def's text slot — same rect, same typography — for every kind. The
 * §1.2 mismatch table from OBJECT-DEF-OVERHAUL.md is the test matrix: every
 * kind that used to get the full-bbox textarea (✗ rows) now gets a
 * slot-positioned editor, and the at-rest renderer consumes the SAME resolved
 * slot, so mid-edit and at-rest text are pixel-identical (caret aside).
 */
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { objectDefFor } from "../../../../../objects/object-def";
import {
  resolveObjectBorderWidth,
  textSlotClampLineCount,
} from "../../../../../objects/object-shell";
import {
  BELOW_BAND_GAP_PX,
  resolveTextSlot,
  slotLineHeightPx,
} from "../../../../../objects/text-slots";
import { CanvasStage } from "../../../../CanvasStage";
import { ObjectShape } from "../../../../ObjectShape";
import type { InteractiveCanvasObject } from "../../../../../state/schema";
import { TextEditingOverlay } from "../TextEditingOverlay";
import type { TextEditingApi } from "../use-text-editing";

function makeObject(partial: Partial<InteractiveCanvasObject> & Pick<InteractiveCanvasObject, "id" | "type">): InteractiveCanvasObject {
  return {
    text: "Hello text",
    parentId: null,
    geometry: { x: 100, y: 200, width: 220, height: 140 },
    ...partial,
  } as InteractiveCanvasObject;
}

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

function renderEditor(object: InteractiveCanvasObject, zoom = 1, value?: string) {
  const view = render(<TextEditingOverlay textEditing={apiFor(object, value)} zoom={zoom} />);
  const editor = view.container.querySelector<HTMLElement>("[data-canvas-text-editor]");
  expect(editor).not.toBeNull();
  return { view, editor: editor! };
}

function webkitLineClamp(element: HTMLElement): string {
  return (
    element.style.getPropertyValue("-webkit-line-clamp") ||
    (element.style as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp ||
    ""
  );
}

function cssPx(value: string): number {
  expect(value.endsWith("px")).toBe(true);
  return Number.parseFloat(value);
}

/** Editor wrapper rect must equal object position + the def's resolved slot rect. */
function expectEditorOnSlot(object: InteractiveCanvasObject, zoom = 1) {
  const def = objectDefFor(object);
  expect(def?.textSlot).toBeDefined();
  const resolved = resolveTextSlot(def!.textSlot!, object, zoom);
  const { editor } = renderEditor(object, zoom);
  expect(editor.style.left).toBe(`${object.geometry.x + resolved.rect.x}px`);
  expect(editor.style.top).toBe(`${object.geometry.y + resolved.rect.y}px`);
  expect(editor.style.width).toBe(`${resolved.rect.width}px`);
  expect(editor.style.height).toBe(`${resolved.rect.height}px`);
  return { editor, resolved };
}

/** The at-rest slot/chip must land at the same world rect the editor uses. */
function expectAtRestMatchesEditor(object: InteractiveCanvasObject) {
  const def = objectDefFor(object);
  const resolved = resolveTextSlot(def!.textSlot!, object);
  const effectiveButtonBorderWidth = resolveObjectBorderWidth(
    object,
    def!.colorRole,
    def!.buttonBorder,
  );
  const view =
    object.type === "section"
      ? render(
          <CanvasStage
            document={{
              schemaVersion: 1,
              id: "at-rest-section-chip-test",
              mode: "diagram",
              objects: [object],
              connections: [],
            }}
            viewport={{ x: 0, y: 0, zoom: 1 }}
          />,
        )
      : render(
          <ObjectShape
            object={object}
            selected={false}
            changed={false}
            bounds={{ minX: 0, minY: 0, maxX: 2000, maxY: 2000 }}
          />,
        );
  const slot = view.container.querySelector<HTMLElement>(
    object.type === "section" ? "[data-canvas-section-title-chip]" : "[data-canvas-text-slot]",
  );
  expect(slot).not.toBeNull();
  const atRestWorldLeft =
    object.type === "section"
      ? cssPx(slot!.style.left)
      : object.geometry.x + effectiveButtonBorderWidth + cssPx(slot!.style.left);
  const atRestWorldTop =
    object.type === "section"
      ? cssPx(slot!.style.top)
      : object.geometry.y + effectiveButtonBorderWidth + cssPx(slot!.style.top);
  expect(atRestWorldLeft).toBeCloseTo(object.geometry.x + resolved.rect.x, 6);
  expect(atRestWorldTop).toBeCloseTo(object.geometry.y + resolved.rect.y, 6);
  if (object.type !== "section") {
    expect(slot!.style.width).toBe(`${resolved.rect.width}px`);
    expect(slot!.style.height).toBe(`${resolved.rect.height}px`);
  }
  return { view, slot: slot!, effectiveButtonBorderWidth };
}

/** Editor control typography must equal the slot typography (D14: no visual jump). */
function expectEditorTypography(object: InteractiveCanvasObject) {
  const def = objectDefFor(object);
  const { typography } = resolveTextSlot(def!.textSlot!, object);
  const { editor } = renderEditor(object);
  const control = def?.textEditing.markdown
    ? editor.querySelector<HTMLElement>('[role="textbox"][aria-label="Object text"]')
    : editor.querySelector<HTMLElement>('textarea[aria-label="Object text"]');
  expect(control).not.toBeNull();
  if (def?.textEditing.markdown) {
    expect(editor.querySelector("textarea")).toBeNull();
  } else {
    expect(control?.tagName).toBe("TEXTAREA");
  }
  expect(control!.style.fontSize).toBe(`${typography.fontSizePx}px`);
  expect(String(control!.style.fontWeight)).toBe(String(typography.fontWeight));
  expect(control!.style.textAlign).toBe(typography.textAlign);
  expect(control!.style.background).toBe("transparent");
  expect(control!.style.border).toContain("none");
  expect(control!.style.overflowWrap).toBe("break-word");
}

afterEach(() => {
  cleanup();
});

describe("editing position: editor rect === slot rect (per §1.2 kind)", () => {
  it("effective button border width follows the rendered button policy", () => {
    const cases: Array<{
      label: string;
      object: InteractiveCanvasObject;
      expected: number;
    }> = [
      {
        label: "painted soft shape",
        object: makeObject({ id: "bw-process", type: "process", style: { shape: "rounded-rect" } }),
        expected: 4,
      },
      {
        label: "painted shape custom stroke width",
        object: makeObject({
          id: "bw-custom",
          type: "process",
          style: { shape: "rounded-rect", strokeWidth: 8 },
        }),
        expected: 8,
      },
      {
        label: "painted bold shape pick (palette rework: every pick paints a border)",
        object: makeObject({
          id: "bw-bold",
          type: "process",
          color: "red",
          style: { shape: "rounded-rect" },
        }),
        expected: 4,
      },
      {
        label: "suppressed SVG silhouette shape",
        object: makeObject({ id: "bw-ellipse", type: "ellipse", style: { shape: "ellipse" } }),
        expected: 0,
      },
      {
        label: "sticky role",
        object: makeObject({ id: "bw-sticky", type: "sticky", style: { shape: "note" } }),
        expected: 0,
      },
      {
        label: "section solid frame",
        object: makeObject({ id: "bw-section", type: "section", style: { shape: "section" } }),
        expected: 2,
      },
      {
        label: "section dashed frame paints outside the button border",
        object: makeObject({
          id: "bw-section-dashed",
          type: "section",
          style: { shape: "section", strokeStyle: "dashed" },
        }),
        expected: 0,
      },
    ];

    for (const { label, object, expected } of cases) {
      const def = objectDefFor(object);
      expect(def).toBeDefined();
      expect({
        label,
        width: resolveObjectBorderWidth(object, def!.colorRole, def!.buttonBorder),
      }).toEqual({ label, width: expected });
    }
  });

  it("generic shape (process / rounded-rect): center slot, not the full bbox", () => {
    const object = makeObject({ id: "p1", type: "process", style: { shape: "rounded-rect" } });
    const { resolved } = expectEditorOnSlot(object);
    // Center preset = content box (bbox minus the 14/12 trim inset).
    expect(resolved.rect).toEqual({ x: 14, y: 12, width: 220 - 28, height: 140 - 24 });
    const { slot, effectiveButtonBorderWidth } = expectAtRestMatchesEditor(object);
    expect(effectiveButtonBorderWidth).toBe(4);
    expect(slot.style.left).toBe("10px");
    expect(slot.style.top).toBe("8px");
    expectEditorTypography(object);
  });

  it("silhouette-aware center slots use analytic safe rects", () => {
    const cases: Array<{ object: InteractiveCanvasObject; expected: ReturnType<typeof resolveTextSlot>["rect"] }> = [
      {
        object: makeObject({
          id: "ellipse-center",
          type: "ellipse",
          geometry: { x: 0, y: 0, width: 160, height: 120 },
          style: { shape: "ellipse" },
        }),
        expected: {
          x: (160 - 160 * 0.68) / 2,
          y: (120 - 120 * 0.68) / 2,
          width: 160 * 0.68,
          height: 120 * 0.68,
        },
      },
      {
        object: makeObject({
          id: "decision-center",
          type: "decision",
          geometry: { x: 0, y: 0, width: 160, height: 112 },
          style: { shape: "diamond" },
        }),
        expected: { x: 46, y: 34, width: 68, height: 44 },
      },
      {
        object: makeObject({
          id: "triangle-up-center",
          type: "triangle",
          geometry: { x: 0, y: 0, width: 140, height: 120 },
          style: { shape: "triangle" },
        }),
        expected: { x: 35, y: 120 * 0.52, width: 70, height: 120 * 0.9 - 120 * 0.52 },
      },
      {
        object: makeObject({
          id: "triangle-down-center",
          type: "triangle",
          direction: "down",
          geometry: { x: 0, y: 0, width: 140, height: 120 },
          style: { shape: "triangle" },
        }),
        expected: { x: 35, y: 12, width: 70, height: 120 * 0.48 - 120 * 0.1 },
      },
      {
        object: makeObject({
          id: "pill-center",
          type: "pill",
          geometry: { x: 0, y: 0, width: 200, height: 64 },
          style: { shape: "pill" },
        }),
        expected: { x: 32, y: 12, width: 136, height: 40 },
      },
    ];

    for (const { object, expected } of cases) {
      const def = objectDefFor(object);
      expect(def?.textSlot).toBeDefined();
      expect(resolveTextSlot(def!.textSlot!, object).rect).toEqual(expected);
    }
  });

  it("generic shape center slot keeps the rect centered while text grows symmetrically", () => {
    const oneLine = makeObject({
      id: "p-center",
      type: "process",
      geometry: { x: 100, y: 200, width: 220, height: 140 },
      style: { shape: "rounded-rect" },
    });
    const threeLines = { ...oneLine, text: "a\nb\nc" };
    const def = objectDefFor(oneLine);
    expect(def?.textSlot).toBeDefined();
    const oneLineResolved = resolveTextSlot(def!.textSlot!, oneLine);
    const threeLineResolved = resolveTextSlot(def!.textSlot!, threeLines);
    expect(threeLineResolved.rect).toEqual(oneLineResolved.rect);
    expect(oneLineResolved.rect.y + oneLineResolved.rect.height / 2).toBe(
      oneLine.geometry.height / 2,
    );

    const { editor } = renderEditor(threeLines);
    expect(editor.style.justifyContent).toBe("center");
    const textarea = editor.querySelector("textarea")!;
    expect(textarea.style.height).not.toBe("100%");

    const { slot } = expectAtRestMatchesEditor(oneLine);
    expect(slot.getAttribute("data-canvas-text-slot")).toBe("center");
    expect(slot.style.justifyContent).toBe("center");
  });

  it("generic shape center text clamps to the inset box with ellipsis", () => {
    const object = makeObject({
      id: "p-center-clamp",
      type: "process",
      text: "a\nb\nc",
      geometry: { x: 100, y: 200, width: 220, height: 42 },
      style: { shape: "rounded-rect" },
    });
    const { slot } = expectAtRestMatchesEditor(object);
    const label = slot.querySelector<HTMLElement>(".interactive-canvas-object-label");
    expect(label).not.toBeNull();
    expect(slot.style.height).toBe("18px");
    expect(slot.style.overflow).toBe("hidden");
    expect(label!.style.overflow).toBe("hidden");
    expect(webkitLineClamp(label!)).toBe("1");
    expect(label!.style.textOverflow).toBe("ellipsis");
  });

  it("arrow-shape: text rect excludes the head (right-pointing)", () => {
    const object = makeObject({
      id: "a1",
      type: "arrow-shape",
      direction: "right",
      geometry: { x: 50, y: 60, width: 361, height: 100 },
      style: { shape: "arrow-shape" },
    });
    const { resolved } = expectEditorOnSlot(object);
    // Body = content width minus the 38% head, anchored at the tail side.
    expect(resolved.rect.x).toBe(14);
    expect(resolved.rect.y).toBe(24);
    expect(resolved.rect.width).toBeCloseTo((361 - 28) * 0.62, 6);
    expect(resolved.rect.height).toBe(52);
    expectAtRestMatchesEditor(object);
  });

  it("arrow-shape: left-pointing anchors the text rect at the tail (right) side", () => {
    const object = makeObject({
      id: "a2",
      type: "arrow-shape",
      direction: "left",
      geometry: { x: 50, y: 60, width: 361, height: 100 },
      style: { shape: "arrow-shape" },
    });
    const { resolved } = expectEditorOnSlot(object);
    expect(resolved.rect.x).toBeCloseTo(14 + (361 - 28) * 0.38, 6);
    expect(resolved.rect.y).toBe(24);
    expect(resolved.rect.height).toBe(52);
    expectAtRestMatchesEditor(object);
  });

  it("chevron: text rect uses the symmetric safe band", () => {
    const object = makeObject({
      id: "c1",
      type: "chevron",
      direction: "right",
      geometry: { x: 0, y: 0, width: 160, height: 120 },
      style: { shape: "chevron" },
    });
    const { resolved } = expectEditorOnSlot(object);
    expect(resolved.rect).toEqual({ x: 46, y: 8, width: 68, height: 104 });
    expectAtRestMatchesEditor(object);
  });

  it("person icon: below-glyph band grows downward from a pinned glyph area", () => {
    const object = makeObject({
      id: "pe1",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const { editor, resolved } = expectEditorOnSlot(object);
    const expectedWidth = "Hello text".length * 15 * 0.62;
    expect(resolved.rect).toEqual({
      x: (120 - expectedWidth) / 2,
      y: 140 + BELOW_BAND_GAP_PX,
      width: expectedWidth,
      height: 18,
    });
    expect(editor.style.justifyContent).toBe("flex-start");
    expect(editor.style.overflow).toBe("hidden");
    const { slot } = expectAtRestMatchesEditor(object);
    expect(slot.style.justifyContent).toBe("flex-start");
    expect(slot.style.overflow).toBe("visible");
    const label = slot.querySelector<HTMLElement>(".interactive-canvas-object-label");
    expect(label).not.toBeNull();
    expect(label!.style.overflowWrap).toBe("break-word");
    expect(label!.style.overflow).toBe("visible");
    expect(webkitLineClamp(label!)).toBe("");
  });

  it("person icon: below-glyph editor draft grows downward and recenters to draft width", () => {
    const object = makeObject({
      id: "pe-draft",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const { slot } = expectAtRestMatchesEditor(object);
    const { editor } = renderEditor(object, 1, "a\nb\nc");
    expect(editor.style.top).toBe(`${object.geometry.y + object.geometry.height + BELOW_BAND_GAP_PX}px`);
    expect(editor.style.left).not.toBe(`${object.geometry.x + Number.parseFloat(slot.style.left)}px`);
    expect(editor.style.height).toBe("54px");
    expect(editor.style.justifyContent).toBe("flex-start");
    expect(editor.style.overflow).toBe("hidden");
  });

  it("chat icon: below-glyph band", () => {
    const object = makeObject({
      id: "ch1",
      type: "icon",
      icon: "chat",
      geometry: { x: 10, y: 20, width: 180, height: 110 },
      style: { shape: "icon" },
    });
    const { resolved } = expectEditorOnSlot(object);
    const expectedWidth = "Hello text".length * 15 * 0.62;
    expect(resolved.rect).toEqual({
      x: (180 - expectedWidth) / 2,
      y: 110 + BELOW_BAND_GAP_PX,
      width: expectedWidth,
      height: 18,
    });
    expectAtRestMatchesEditor(object);
  });

  it("icon: below-glyph band", () => {
    const object = makeObject({
      id: "i1",
      type: "icon",
      icon: "gear",
      geometry: { x: 0, y: 0, width: 120, height: 120 },
      style: { shape: "icon" },
    });
    const { resolved } = expectEditorOnSlot(object);
    const expectedWidth = "Hello text".length * 15 * 0.62;
    expect(resolved.rect).toEqual({
      x: (120 - expectedWidth) / 2,
      y: 120 + BELOW_BAND_GAP_PX,
      width: expectedWidth,
      height: 18,
    });
    expectAtRestMatchesEditor(object);
  });

  it("sticky: inset body area (not the full bbox), top-anchored, live markdown editor preserves source", () => {
    const object = makeObject({
      id: "s1",
      type: "sticky",
      text: "# Heading\n- bullet",
      geometry: { x: 80, y: 100, width: 240, height: 220 },
      style: { shape: "note" },
    });
    const { editor, resolved } = expectEditorOnSlot(object);
    expect(resolved.rect).toEqual({ x: 21, y: 28, width: 240 - 42, height: 220 - 28 - 21 });
    expect(editor.style.justifyContent).toBe("flex-start");
    const markdownEditor = editor.querySelector<HTMLElement>('[role="textbox"][aria-label="Object text"]');
    expect(markdownEditor).not.toBeNull();
    expect(markdownEditor!.getAttribute("aria-multiline")).toBe("true");
    expect(editor.querySelector("textarea")).toBeNull();
    // The editor decorates markdown live, but the serialized draft remains the
    // exact raw source string that use-text-editing owns.
    expect(markdownEditor!.getAttribute("data-sticky-markdown-source")).toBe("# Heading\n- bullet");
    const { slot } = expectAtRestMatchesEditor(object);
    expect(slot.style.overflow).toBe("hidden");
    const label = slot.querySelector<HTMLElement>(".interactive-canvas-object-label");
    const lineHeightPx = slotLineHeightPx(resolved.typography);
    const clampLines = textSlotClampLineCount(resolved.rect.height, lineHeightPx);
    expect(label?.style.maxHeight).toBe(`${clampLines * lineHeightPx}px`);
    expect(webkitLineClamp(label!)).toBe(String(clampLines));
    expect(label?.style.getPropertyValue("-webkit-box-orient")).toBe("vertical");
    expect(label?.style.textOverflow).toBe("ellipsis");
    expectEditorTypography(object);
  });

  it("section: chip-exact input at the title-chip slot", () => {
    const object = makeObject({
      id: "se1",
      type: "section",
      text: "My Section",
      color: "gray",
      geometry: { x: 40, y: 40, width: 480, height: 360 },
      style: { shape: "section" },
    });
    const { editor, resolved } = expectEditorOnSlot(object);
    expect(resolved.rect.x).toBe(3);
    expect(resolved.rect.y).toBe(3);
    expect(resolved.rect.height).toBe(27);
    expect(editor.getAttribute("data-canvas-section-title-editor")).toBe("se1");
    const { slot, effectiveButtonBorderWidth } = expectAtRestMatchesEditor(object);
    expect(effectiveButtonBorderWidth).toBe(2);
    expect(slot.style.left).toBe("43px");
    expect(slot.style.top).toBe("43px");
  });

  it("section: chip editor counter-scales when zoomed out, like the chip", () => {
    const object = makeObject({
      id: "se2",
      type: "section",
      text: "My Section",
      color: "gray",
      geometry: { x: 40, y: 40, width: 480, height: 360 },
      style: { shape: "section" },
    });
    const { editor, resolved } = expectEditorOnSlot(object, 0.25);
    expect(resolved.scale).toBeGreaterThan(1);
    expect(editor.style.transform).toBe(`scale(${resolved.scale})`);
  });

  it("kinds without a text slot render no editor (plus)", () => {
    const object = makeObject({
      id: "pl1",
      type: "plus",
      geometry: { x: 0, y: 0, width: 120, height: 120 },
      style: { shape: "plus" },
    });
    const view = render(<TextEditingOverlay textEditing={apiFor(object)} zoom={1} />);
    expect(view.container.querySelector("[data-canvas-text-editor]")).toBeNull();
  });
});
