/**
 * Arrowheads print at least 14 world px, and the stage marker and the static
 * PNG renderer paint the same head (connectors/arrowhead.ts).
 */
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStageWithInteraction as CanvasStage } from "./canvas-stage-test-utils";
import { renderDocumentToSvg } from "../../render/static-svg";
import { DEFAULT_CANVAS_STYLE, FIGJAM_CANVAS_STYLE, type CanvasStyle } from "../../theme/canvas-style";
import { CanvasStyleProvider } from "../../theme/canvas-style-context";
import type { InteractiveCanvasDocument } from "../../state/schema";

afterEach(() => {
  cleanup();
});

const viewport = { x: 0, y: 0, zoom: 1 };

function makeDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "arrowhead-size-doc",
    mode: "diagram",
    objects: [
      { id: "a", type: "process", text: "A", geometry: { x: 0, y: 0, width: 160, height: 96 } },
      { id: "b", type: "process", text: "B", geometry: { x: 400, y: 0, width: 160, height: 96 } },
    ],
    connections: [
      {
        id: "a-b",
        from: { objectId: "a", anchor: "right" },
        to: { objectId: "b", anchor: "left" },
        style: "solid",
        arrow: "forward",
      },
    ],
  };
}

/** World length and base width of the stage's forward marker: marker units are stroke widths. */
function stageHead(style: CanvasStyle): { length: number; width: number } {
  const { container } = render(
    <CanvasStyleProvider value={style}>
      <CanvasStage document={makeDocument()} viewport={viewport} />
    </CanvasStyleProvider>,
  );
  const marker = container.querySelector('marker[id$="-arrow-forward"]')!;
  const stroke = style.connectorStrokeWidthPx;
  return {
    length: Number(marker.getAttribute("markerWidth")) * stroke,
    width: Number(marker.getAttribute("markerHeight")) * stroke,
  };
}

/** World length (tip to base midpoint) and base width of the static renderer's arrowhead polygon. */
function staticHead(style: CanvasStyle): { length: number; width: number } {
  const { svg } = renderDocumentToSvg(makeDocument(), { canvasStyle: style });
  const points = /<polygon points="([^"]+)"/.exec(svg)![1]!
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as [number, number]);
  const [tip, left, right] = points as [[number, number], [number, number], [number, number]];
  const base = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  return {
    length: Math.hypot(tip[0] - base[0]!, tip[1] - base[1]!),
    width: Math.hypot(left[0] - right[0], left[1] - right[1]),
  };
}

describe("arrowhead size", () => {
  it("schematic-light's 2px stroke gets a 14px head in the stage and the PNG renderer alike", () => {
    expect(DEFAULT_CANVAS_STYLE.connectorStrokeWidthPx).toBe(2);
    const stage = stageHead(DEFAULT_CANVAS_STYLE);
    const png = staticHead(DEFAULT_CANVAS_STYLE);
    expect(stage).toEqual({ length: 14, width: 14 });
    expect(png.length).toBeCloseTo(14, 1);
    expect(png.width).toBeCloseTo(14, 1);
  });

  it("a stroke whose 5x head already clears 14px keeps 5x (figjam's 4px stroke: 20px)", () => {
    const stage = stageHead(FIGJAM_CANVAS_STYLE);
    const png = staticHead(FIGJAM_CANVAS_STYLE);
    expect(stage).toEqual({ length: 20, width: 20 });
    expect(png.length).toBeCloseTo(20, 1);
    expect(png.width).toBeCloseTo(20, 1);
  });

  it("a thin custom stroke is floored at 14px too", () => {
    const thin = { ...DEFAULT_CANVAS_STYLE, connectorStrokeWidthPx: 1 };
    expect(stageHead(thin)).toEqual({ length: 14, width: 14 });
    expect(staticHead(thin).width).toBeCloseTo(14, 1);
  });
});
