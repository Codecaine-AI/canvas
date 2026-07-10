import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { resolveObjectRoleColors } from "../object-shell";
import { OBJECT_DEFS, objectDefForType } from "../object-def";
import { OBJECT_TEXT_COLOR } from "../text-slots";
import { ObjectShape } from "../../stage/ObjectShape";
import type { CanvasObjectColor, InteractiveCanvasObject } from "../../state/schema";
import {
  resolveConnectorStroke,
  resolveSectionColors,
  resolveShapeColors,
  resolveStickyFill,
} from "../../theme/palette";

/**
 * P1 role resolution (OBJECT-DEF-OVERHAUL.md §3.2/§3.5, D8/D12/D17): one
 * stored pick, per-kind expression through the palette role tables, one
 * fixed dark text color, per-kind first-use fallbacks when no pick is set.
 */

describe("resolveObjectRoleColors: shape role", () => {
  it("pick = fill + ink border", () => {
    expect(resolveObjectRoleColors({ color: "red" }, "shape")).toEqual({
      fill: "#FFC7C2",
      border: "#F24822",
      text: OBJECT_TEXT_COLOR,
    });
  });

  it("white keeps a visible ink border", () => {
    const white = resolveObjectRoleColors({ color: "white" }, "shape");
    expect(white.fill).toBe("#FFFFFF");
    expect(white.border).toBe("#757575");
  });

  it("no pick falls back to the shape first-use default (gray)", () => {
    expect(resolveObjectRoleColors({}, "shape")).toEqual(
      resolveObjectRoleColors({ color: "gray" }, "shape"),
    );
    expect(resolveObjectRoleColors({}, "shape").fill).toBe(resolveShapeColors("gray").fill);
  });
});

describe("resolveObjectRoleColors: sticky role", () => {
  it("resolves the exact sticky fill hex, borderless, dark text", () => {
    expect(resolveObjectRoleColors({ color: "blue" }, "sticky")).toEqual({
      fill: resolveStickyFill("blue"),
      border: null,
      text: OBJECT_TEXT_COLOR,
    });
  });

  it("no pick falls back to the classic yellow sticky", () => {
    expect(resolveObjectRoleColors({}, "sticky").fill).toBe(resolveStickyFill("yellow"));
    expect(resolveObjectRoleColors({}, "sticky").fill).toBe("#FFE299");
  });
});

function makeStickyObject(color: CanvasObjectColor): InteractiveCanvasObject {
  return {
    id: `sticky-${color}`,
    type: "sticky",
    text: "Sticky note",
    color,
    parentId: null,
    geometry: { x: 10, y: 20, width: 220, height: 180 },
    style: { shape: "note" },
  } as InteractiveCanvasObject;
}

function expectRenderedStickyColor(color: CanvasObjectColor) {
  const view = render(
    createElement(ObjectShape, {
      object: makeStickyObject(color),
      selected: false,
      changed: false,
      bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 2000 },
    }),
  );
  const button = view.container.querySelector<HTMLButtonElement>("button");
  expect(button).not.toBeNull();
  expect(button!.style.borderWidth).toBe("0px");
  expect(button!.style.background).toBe(resolveStickyFill(color));
}

describe("ObjectShape sticky rendering", () => {
  it("renders sticky picks through the sticky role table", () => {
    expectRenderedStickyColor("blue");
  });
});

describe("resolveObjectRoleColors: section role", () => {
  it("fill = tint cell, border = the title chip's FILL color (§3.2)", () => {
    const cells = resolveSectionColors("green");
    expect(resolveObjectRoleColors({ color: "green" }, "section")).toEqual({
      fill: cells.tint,
      border: cells.chip.fill,
      text: OBJECT_TEXT_COLOR,
    });
  });

  it("no pick falls back to the neutral gray family", () => {
    expect(resolveObjectRoleColors({}, "section")).toEqual(
      resolveObjectRoleColors({ color: "gray" }, "section"),
    );
  });
});

describe("connector role", () => {
  it("the default gray pick resolves to the sampled neutral stroke", () => {
    expect(resolveConnectorStroke("gray")).toBe("#757575");
  });
});

describe("ObjectDef.colorRole (§3.5)", () => {
  it("every registered def declares its role table", () => {
    for (const def of OBJECT_DEFS) {
      expect(["shape", "sticky", "section"]).toContain(def.colorRole);
    }
  });

  it("section/sticky use their own roles; everything else uses the shape role", () => {
    expect(objectDefForType("section")?.colorRole).toBe("section");
    expect(objectDefForType("sticky")?.colorRole).toBe("sticky");
    expect(objectDefForType("process")?.colorRole).toBe("shape");
    expect(objectDefForType("icon")?.colorRole).toBe("shape");
  });
});
