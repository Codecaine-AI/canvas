import { describe, expect, it } from "bun:test";
import { sectionTitleChipWorldRect } from "../../../../objects/section/title-chip-geometry";
import { belowExtendedBoundsPx } from "../../../../objects/text-slots";
import { ANCHOR_DOT_OFFSET_PX, HIT_TARGET_PX } from "../../../../connectors/AnchorDots";
import { DEFAULT_CANVAS_STYLE } from "../../../../theme/canvas-style";
import type { CanvasPoint } from "../../../../state/geometry";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../state/schema";
import { resolveHoverTarget } from "../use-hover-target";

function makeDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "hover-target-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

function processObject(
  id: string,
  geometry = { x: 0, y: 0, width: 100, height: 100 },
): InteractiveCanvasObject {
  return {
    id,
    type: "process",
    text: id,
    geometry,
  };
}

function sectionObject(
  id: string,
  geometry = { x: 0, y: 0, width: 240, height: 180 },
): InteractiveCanvasObject {
  return {
    id,
    type: "section",
    text: id,
    geometry,
    style: { shape: "section" },
  };
}

function resolve(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
  previousHoveredObjectId: string | null = null,
) {
  return resolveHoverTarget({
    document,
    worldPoint,
    zoom: 1,
    previousHoveredObjectId,
  });
}

describe("resolveHoverTarget", () => {
  it("enters hover on an outline hit", () => {
    const document = makeDocument([processObject("process")]);

    expect(resolve(document, { x: 50, y: 50 })).toBe("process");
  });

  it("keeps the current hover target inside the expanded anchor-dot halo", () => {
    const document = makeDocument([processObject("process")]);

    expect(resolve(document, { x: 50, y: -35 }, "process")).toBe("process");
  });

  it("drops hover outside the expanded anchor-dot halo", () => {
    const document = makeDocument([processObject("process")]);

    expect(resolve(document, { x: 50, y: -37 }, "process")).toBeNull();
  });

  it("immediately steals hover on a different object's outline hit", () => {
    const first = processObject("first");
    const second = processObject("second", { x: 120, y: 0, width: 100, height: 100 });
    const document = makeDocument([first, second]);

    expect(resolve(document, { x: 130, y: 50 }, "first")).toBe("second");
  });

  it("treats empty section interiors as free canvas", () => {
    const section = sectionObject("section");
    const document = makeDocument([section]);

    expect(resolve(document, { x: 120, y: 90 })).toBeNull();
  });

  it("enters hover on a section border or title chip", () => {
    const section = sectionObject("section");
    const document = makeDocument([section]);
    const chip = sectionTitleChipWorldRect(section, 1);

    expect(resolve(document, { x: 5, y: 90 })).toBe("section");
    expect(resolve(document, { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 })).toBe(
      "section",
    );
  });

  it("lets an object inside a section win over the section", () => {
    const section = sectionObject("section");
    const child = {
      ...processObject("child", { x: 40, y: 40, width: 80, height: 60 }),
      parentId: "section",
    };
    const document = makeDocument([section, child]);

    expect(resolve(document, { x: 80, y: 70 })).toBe("child");
  });
});

describe("resolveHoverTarget: styled below-band captions", () => {
  it("keeps hover within the halo around the caption the active style paints", () => {
    const style = { ...DEFAULT_CANVAS_STYLE, detailFontSizePx: 20 };
    const icon: InteractiveCanvasObject = {
      id: "db",
      type: "icon",
      icon: "database",
      text: "DB",
      detail: "port: 5432",
      geometry: { x: 0, y: 0, width: 64, height: 64 },
    };
    const halo = ANCHOR_DOT_OFFSET_PX + HIT_TARGET_PX / 2 + 2;
    const point = { x: 32, y: belowExtendedBoundsPx(icon, style).height + halo - 1 };
    const args = { document: makeDocument([icon]), worldPoint: point, zoom: 1, previousHoveredObjectId: "db" };

    expect(resolveHoverTarget({ ...args, canvasStyle: style })).toBe("db");
    expect(resolveHoverTarget(args)).toBeNull();
  });
});
