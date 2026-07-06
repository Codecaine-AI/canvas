import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import type { InteractionOverlay } from "../../interaction/interaction";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { DISTRIBUTION_GUIDE_COLOR } from "../../interaction/snapping";

afterEach(() => {
  cleanup();
});

/**
 * W3b render smokes: hover ports + snapped-anchor highlight during connector
 * drags, hollow FigJam-blue endpoint circles on selected connectors,
 * distribution (equal-spacing) guides, the bend-affordance stub, and the
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
        label: "Process A",
        geometry: { x: 0, y: 0, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        label: "Process B",
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
  function dragOverlay(candidate: NonNullable<InteractionOverlay["connectorDrag"]>["candidate"]): InteractionOverlay {
    return {
      connectorDrag: {
        fromObjectId: "process-a",
        fromAnchor: "right",
        point: { x: 402, y: 48 },
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
});

describe("CanvasStage: selected-connector chrome (W3b)", () => {
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
    expect(to!.getAttribute("stroke")).toBe(SELECTION_BLUE);
  });

  it("renders render-only bend-affordance stubs at elbow corners with a crosshair cursor", () => {
    // A vertical offset between the two objects forces the elbow route to turn.
    const documentWithElbow = makeDocument({
      objects: [
        { id: "process-a", type: "process", label: "A", geometry: { x: 0, y: 0, width: 160, height: 96 } },
        { id: "process-b", type: "process", label: "B", geometry: { x: 400, y: 300, width: 160, height: 96 } },
      ],
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          style: "elbow",
          arrow: "forward",
        },
      ],
    });
    const { container } = render(
      <CanvasStage document={documentWithElbow} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    const stubs = container.querySelectorAll('[data-canvas-bend-stub="connection-a"]');
    expect(stubs.length).toBeGreaterThan(0);
    const stub = stubs[0] as SVGRectElement;
    expect(stub.style.cursor).toBe("crosshair");
  });

  it("renders no bend stubs when the connection is not selected", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} selectedConnectionId={null} />,
    );
    expect(container.querySelectorAll("[data-canvas-bend-stub]").length).toBe(0);
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

describe("CanvasStage: connection color (W4 blocker)", () => {
  it("renders connection.color as the visible stroke, falling back to the default gray", () => {
    const documentWithColor = makeDocument({
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          style: "solid",
          arrow: "forward",
          color: "#EB7500",
        },
      ],
    });
    const { container } = render(<CanvasStage document={documentWithColor} viewport={viewport} />);
    const group = container.querySelector('[data-canvas-connection-group="connection-a"]');
    const visiblePath = group!.querySelectorAll("path")[1]!;
    expect(visiblePath.getAttribute("stroke")).toBe("#EB7500");

    cleanup();
    const { container: defaultContainer } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} />,
    );
    const defaultGroup = defaultContainer.querySelector('[data-canvas-connection-group="connection-a"]');
    expect(defaultGroup!.querySelectorAll("path")[1]!.getAttribute("stroke")).toBe("#757575");
  });

  it("selection still recolors the stroke to the selection token over connection.color", () => {
    const documentWithColor = makeDocument({
      connections: [
        {
          id: "connection-a",
          from: { objectId: "process-a", anchor: "right" },
          to: { objectId: "process-b", anchor: "left" },
          color: "#3E9B4B",
        },
      ],
    });
    const { container } = render(
      <CanvasStage document={documentWithColor} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    const group = container.querySelector('[data-canvas-connection-group="connection-a"]');
    expect(group!.querySelectorAll("path")[1]!.getAttribute("stroke")).toBe("var(--primary)");
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
