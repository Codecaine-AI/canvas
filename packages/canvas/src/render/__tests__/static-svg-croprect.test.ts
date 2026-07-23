import { describe, expect, it } from "bun:test";
import { renderDocumentToSvg } from "../static-svg";
import type { InteractiveCanvasDocument } from "../../state/schema";

function fixtureDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "croprect-fixture",
    mode: "diagram",
    objects: [
      {
        id: "sec-1",
        type: "section",
        text: "Zone",
        geometry: { x: 0, y: 0, width: 480, height: 360 },
        style: { shape: "section" },
      },
      {
        id: "p1",
        type: "process",
        text: "Start",
        parentId: "sec-1",
        geometry: { x: 40, y: 60, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
      {
        id: "p2",
        type: "process",
        text: "Outside",
        geometry: { x: 600, y: 240, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
    ],
    connections: [
      { id: "c1", from: { objectId: "p1" }, to: { objectId: "p2" }, arrow: "forward" },
    ],
  };
}

describe("renderDocumentToSvg cropRect", () => {
  it("sets the viewBox to the rect expanded by padding on all sides", () => {
    const { svg, width, height } = renderDocumentToSvg(fixtureDocument(), {
      cropRect: { x: 100, y: 50, width: 300, height: 200 },
      padding: 10,
    });
    expect(svg).toContain('viewBox="90 40 320 220"');
    // Natural size: one px per world unit of the padded rect.
    expect(width).toBe(320);
    expect(height).toBe(220);
  });

  it("defaults to zero padding — the rect is authoritative", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument(), {
      cropRect: { x: 16, y: 32, width: 240, height: 120 },
    });
    expect(svg).toContain('viewBox="16 32 240 120"');
  });

  it("wins over sectionId when both are given", () => {
    const withBoth = renderDocumentToSvg(fixtureDocument(), {
      sectionId: "sec-1",
      cropRect: { x: 100, y: 50, width: 300, height: 200 },
    });
    expect(withBoth.svg).toContain('viewBox="100 50 300 200"');
    // And a cropRect render keeps content outside the section (viewBox does
    // the clipping — the whole document still renders).
    expect(withBoth.svg).toContain("Outside");
  });

  it("does not change the default (no-cropRect) render path", () => {
    const plain = renderDocumentToSvg(fixtureDocument());
    const explicitUndefined = renderDocumentToSvg(fixtureDocument(), { cropRect: undefined });
    expect(explicitUndefined.svg).toBe(plain.svg);
  });
});
