import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStageWithInteraction as CanvasStage } from "./canvas-stage-test-utils";
import type { InteractionOverlay } from "../editor/pipeline/state";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { DISTRIBUTION_GUIDE_COLOR } from "../editor/features/snapping/snapping";

afterEach(() => {
  cleanup();
});

/**
 * W3b render smokes: hover ports + snapped-anchor highlight during connector
 * drags, hollow FigJam-blue endpoint circles on selected connectors,
 * distribution (equal-spacing) guides, the segment bend pills, and the
 * per-connection color field (stroke + context-stroke arrowheads).
 */

const SELECTION_BLUE = "#0D99FF";

function makeDocument(overrides: Partial<InteractiveCanvasDocument> = {}): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "w3b-overlay-doc",
    mode: "diagram",
    objects: [
      {
        id: "process-a",
        type: "process",
        text: "Process A",
        geometry: { x: 0, y: 0, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        text: "Process B",
        geometry: { x: 400, y: 0, width: 160, height: 96 },
      },
    ],
    connections: [
      {
        id: "connection-a",
        from: { objectId: "process-a", anchor: "right" },
        to: { objectId: "process-b", anchor: "left" },
        style: "solid",
        arrow: "forward",
      },
    ],
    ...overrides,
  };
}

const viewport = { x: 0, y: 0, zoom: 1 };

describe("CanvasStage: connector drag hover ports (W3b)", () => {
  function dragOverlay(
    candidate: NonNullable<InteractionOverlay["connectorDrag"]>["candidate"],
    point = { x: 402, y: 48 },
  ): InteractionOverlay {
    return {
      connectorDrag: {
        fromObjectId: "process-a",
        fromAnchor: "right",
        point,
        candidate,
      },
    };
  }

  it("renders 4 hover-port dots on the candidate object with the snapped anchor emphasized", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        interactionOverlay={dragOverlay({
          objectId: "process-b",
          anchor: "left",
          point: { x: 400, y: 48 }, // process-b's left outline anchor
          snapKind: "anchor",
        })}
      />,
    );
    const dots = container.querySelectorAll("[data-canvas-anchor-dot]");
    expect(dots.length).toBe(4);
    const snapped = container.querySelectorAll("[data-canvas-anchor-snapped]");
    expect(snapped.length).toBe(1);
    expect(snapped[0]!.getAttribute("data-canvas-anchor-dot")).toBe("left");
    // FigJam port style: white fill, selection-blue ring on the un-snapped dots.
    const plain = Array.from(dots).find((dot) => !dot.hasAttribute("data-canvas-anchor-snapped")) as HTMLElement;
    expect(plain.style.background.toLowerCase()).toBe("#ffffff");
    expect(plain.style.border).toContain("1.5px");
  });

  it("renders the outline-snap dot at the exact off-anchor attach point", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        interactionOverlay={dragOverlay({
          objectId: "process-b",
          anchor: "top",
          point: { x: 480, y: 0 },
          position: [0.5, 0],
          snapKind: "outline",
        })}
      />,
    );
    const dot = container.querySelector("[data-canvas-outline-snap-dot]") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.style.left).toBe("480px");
    expect(dot.style.top).toBe("0px");
    // No anchor is emphasized for an outline snap.
    expect(container.querySelectorAll("[data-canvas-anchor-snapped]").length).toBe(0);
  });

  it("renders no port dots when there is no candidate", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} interactionOverlay={dragOverlay(undefined)} />,
    );
    expect(container.querySelectorAll("[data-canvas-anchor-dot]").length).toBe(0);
  });

  it("renders a source-shaped empty-canvas ghost and gray preview stroke", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} interactionOverlay={dragOverlay(undefined)} />,
    );
    const ghost = container.querySelector("[data-canvas-quick-connect-ghost]") as HTMLElement;
    expect(ghost).toBeTruthy();
    expect(ghost.style.opacity).toBe("0.35");
    // The wrapper carries the screen position + zoom scale; the object inside
    // renders at WORLD size from 0,0 so size-derived stroke logic matches the
    // object a click will create.
    expect(ghost.style.left).toBe("322px");
    expect(ghost.style.top).toBe("0px");
    expect(ghost.style.transform).toBe("scale(1)");

    const ghostObject = ghost.querySelector('[data-canvas-object-id="process-a-quick-connect-ghost"]') as HTMLElement;
    expect(ghostObject).toBeTruthy();
    expect(ghostObject.getAttribute("data-canvas-object-type")).toBe("process");
    expect(ghostObject.style.left).toBe("0px");
    expect(ghostObject.style.top).toBe("0px");
    expect(ghostObject.style.width).toBe("160px");
    expect(ghostObject.style.height).toBe("96px");

    const previewPath = container.querySelector("[data-canvas-connector-preview-path]") as SVGPathElement;
    expect(previewPath.getAttribute("stroke")).toBe("#757575");
    expect(previewPath.getAttribute("stroke-width")).toBe("4");
    expect(previewPath.getAttribute("stroke-dasharray")).toBeNull();
    expect(previewPath.getAttribute("marker-end")).toBe("url(#w3b-overlay-doc-arrow-forward)");
  });

  it("renders an empty-canvas create preview as a routed elbow, not a diagonal line", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        interactionOverlay={dragOverlay(undefined, { x: 280, y: 180 })}
      />,
    );

    const previewPath = container.querySelector("[data-canvas-connector-preview-path]") as SVGPathElement;
    expect(previewPath).toBeTruthy();
    expect(previewPath.getAttribute("d")).toContain("Q");
    expect(previewPath.getAttribute("d")).not.toBe("M 160 48 L 280 180");
  });

  it("renders a forward arrowhead only on to-endpoint re-drag previews", () => {
    const toDrag = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        interactionOverlay={{
          connectorDrag: {
            connectionId: "connection-a",
            end: "to",
            point: { x: 280, y: 180 },
          },
        }}
      />,
    );
    const toPreviewPath = toDrag.container.querySelector(
      "[data-canvas-connector-preview-path]",
    ) as SVGPathElement;
    expect(toPreviewPath.getAttribute("marker-end")).toBe("url(#w3b-overlay-doc-arrow-forward)");
    toDrag.unmount();

    const fromDrag = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        interactionOverlay={{
          connectorDrag: {
            connectionId: "connection-a",
            end: "from",
            point: { x: 280, y: 180 },
          },
        }}
      />,
    );
    const fromPreviewPath = fromDrag.container.querySelector(
      "[data-canvas-connector-preview-path]",
    ) as SVGPathElement;
    expect(fromPreviewPath.getAttribute("marker-end")).toBeNull();
  });
});

describe("CanvasStage: selected-connector trim (W3b)", () => {
  it("hides selected object handles while connector mode is active", () => {
    const select = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        selectedObjectIds={["process-a"]}
        activeTool="select"
      />,
    );
    expect(select.container.querySelector("[data-canvas-selection-box]")).toBeTruthy();
    expect(select.container.querySelectorAll("[data-canvas-handle]").length).toBeGreaterThan(0);
    select.unmount();

    const connector = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        selectedObjectIds={["process-a"]}
        activeTool="connector"
      />,
    );
    expect(connector.container.querySelector("[data-canvas-selection-box]")).toBeNull();
    expect(connector.container.querySelectorAll("[data-canvas-handle]").length).toBe(0);
  });

  it("renders hollow selection-blue endpoint circles at both terminals", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    const from = container.querySelector('[data-canvas-endpoint="from"]');
    const to = container.querySelector('[data-canvas-endpoint="to"]');
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    expect(from!.getAttribute("fill")).toBe("#FFFFFF");
    expect(from!.getAttribute("stroke")).toBe(SELECTION_BLUE);
    expect(from!.getAttribute("r")).toBe("7.5");
    expect(from!.getAttribute("stroke-width")).toBe("2.5");
    expect(to!.getAttribute("stroke")).toBe(SELECTION_BLUE);
  });

  it("hides selected connector trim while connector mode is active", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        selectedConnectionId="connection-a"
        activeTool="connector"
      />,
    );
    expect(container.querySelector("[data-canvas-connection-trim]")).toBeNull();
    expect(container.querySelector('[data-canvas-endpoint="from"]')).toBeNull();
    expect(container.querySelectorAll("[data-canvas-bend-segment]").length).toBe(0);
  });

  it("renders segment bend pills for every routed segment with axis cursors", () => {
    // A vertical offset between the two objects forces the elbow route to turn.
    const documentWithElbow = makeDocument({
      objects: [
        { id: "process-a", type: "process", text: "A", geometry: { x: 0, y: 0, width: 160, height: 96 } },
        { id: "process-b", type: "process", text: "B", geometry: { x: 400, y: 300, width: 160, height: 96 } },
      ],
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          style: "solid",
          arrow: "forward",
        },
      ],
    });
    const { container } = render(
      <CanvasStage document={documentWithElbow} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    const pills = container.querySelectorAll('[data-canvas-connection-id="connection-a"][data-canvas-bend-segment]');
    expect(pills.length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-canvas-bend-stub]").length).toBe(0);
    expect(pills[0]!.getAttribute("fill")).toBe(SELECTION_BLUE);
    expect(pills[0]!.getAttribute("width")).toBe("26");
    expect(pills[0]!.getAttribute("height")).toBe("8");

    const cursors = new Set(Array.from(pills).map((pill) => (pill as SVGRectElement).style.cursor));
    expect(cursors.has("ns-resize")).toBe(true);
    expect(cursors.has("ew-resize")).toBe(true);
  });

  it("hides bend pills below 40% zoom but keeps endpoint handles visible", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={{ x: 0, y: 0, zoom: 0.39 }}
        selectedConnectionId="connection-a"
      />,
    );
    expect(container.querySelectorAll("[data-canvas-bend-segment]").length).toBe(0);
    expect(container.querySelector('[data-canvas-endpoint="from"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-endpoint="to"]')).toBeTruthy();
  });

  it("renders no bend pills when the connection is not selected", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} selectedConnectionId={null} />,
    );
    expect(container.querySelectorAll("[data-canvas-bend-segment]").length).toBe(0);
  });
});

describe("CanvasStage: distribution guides (W3b)", () => {
  it("renders equal-spacing guide segments in AFFiNE's distribution color", () => {
    const overlay: InteractionOverlay = {
      distributionGuides: [
        { x1: 100, y1: 50, x2: 200, y2: 50 },
        { x1: 300, y1: 50, x2: 400, y2: 50 },
      ],
    };
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} interactionOverlay={overlay} />,
    );
    const guides = container.querySelectorAll("[data-canvas-distribution-guide]");
    expect(guides.length).toBe(2);
    const path = guides[0]!.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe(DISTRIBUTION_GUIDE_COLOR);
  });

  it("renders nothing when distributionGuides is absent", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} interactionOverlay={{}} />,
    );
    expect(container.querySelectorAll("[data-canvas-distribution-guide]").length).toBe(0);
  });
});

describe("CanvasStage: connection color (P1 palette picks)", () => {
  it("resolves connection.color through the connector role cells, falling back to the default gray", () => {
    const documentWithColor = makeDocument({
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          style: "solid",
          arrow: "forward",
          color: "orange",
        },
      ],
    });
    const { container } = render(<CanvasStage document={documentWithColor} viewport={viewport} />);
    const group = container.querySelector('[data-canvas-connection-group="connection-a"]');
    const visiblePath = group!.querySelectorAll("path")[1]!;
    // The "orange" pick's connector cell is the sampled #EB7500 stroke.
    expect(visiblePath.getAttribute("stroke")).toBe("#EB7500");

    cleanup();
    const { container: defaultContainer } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} />,
    );
    const defaultGroup = defaultContainer.querySelector('[data-canvas-connection-group="connection-a"]');
    expect(defaultGroup!.querySelectorAll("path")[1]!.getAttribute("stroke")).toBe("#757575");
  });

  it("selection keeps the connector palette stroke over connection.color", () => {
    const documentWithColor = makeDocument({
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          color: "green",
        },
      ],
    });
    const { container } = render(
      <CanvasStage document={documentWithColor} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    const group = container.querySelector('[data-canvas-connection-group="connection-a"]');
    expect(group!.querySelectorAll("path")[1]!.getAttribute("stroke")).toBe("#14AE5C");
  });

  it("arrowhead markers inherit the connector stroke via context-stroke fill", () => {
    const { container } = render(<CanvasStage document={makeDocument()} viewport={viewport} />);
    const markerPaths = container.querySelectorAll("marker path");
    expect(markerPaths.length).toBe(2);
    for (const path of markerPaths) {
      expect(path.getAttribute("fill")).toBe("context-stroke");
    }
  });
});
