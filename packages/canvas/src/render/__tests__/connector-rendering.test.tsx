import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import type { InteractiveCanvasDocument } from "../../state/schema";

afterEach(() => {
  cleanup();
});

function makeDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "connector-render-doc",
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
        label: "handles",
        style: "solid",
        arrow: "forward",
      },
    ],
  };
}

const viewport = { x: 0, y: 0, zoom: 1 };

describe("CanvasStage: connector rendering (3.1.2 / 3.3.1)", () => {
  it("renders a wide invisible hit path with data-canvas-connection-id", () => {
    const { container } = render(<CanvasStage document={makeDocument()} viewport={viewport} />);
    const hitPath = container.querySelector('[data-canvas-connection-id="connection-a"]');
    expect(hitPath).toBeTruthy();
    expect(hitPath?.getAttribute("stroke-width")).toBe("14");
  });

  it("renders endpoint handles only when the connection is selected", () => {
    const notSelected = render(
      <CanvasStage document={makeDocument()} viewport={viewport} selectedConnectionId={null} />,
    );
    expect(notSelected.container.querySelector('[data-canvas-endpoint="from"]')).toBeNull();
    notSelected.unmount();

    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} selectedConnectionId="connection-a" />,
    );
    expect(container.querySelector('[data-canvas-endpoint="from"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-endpoint="to"]')).toBeTruthy();
  });

  it("renders a label chip at the connector's label point", () => {
    const { container } = render(<CanvasStage document={makeDocument()} viewport={viewport} />);
    const chip = container.querySelector('[data-canvas-connection-label="connection-a"]');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toBe("handles");
  });

  it("forwards double-click on the hit path as the editConnectionLabel intent", () => {
    const onConnectionDoubleClick = mock((_connectionId: string) => {});
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        onConnectionDoubleClick={onConnectionDoubleClick}
      />,
    );
    const hitPath = container.querySelector('[data-canvas-connection-id="connection-a"]');
    expect(hitPath).toBeTruthy();
    fireEvent.doubleClick(hitPath!);
    expect(onConnectionDoubleClick).toHaveBeenCalledWith("connection-a");
  });

  it("forwards double-click on the label chip as the editConnectionLabel intent", () => {
    const onConnectionDoubleClick = mock((_connectionId: string) => {});
    const { container } = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        onConnectionDoubleClick={onConnectionDoubleClick}
      />,
    );
    const chip = container.querySelector('[data-canvas-connection-label="connection-a"]');
    expect(chip).toBeTruthy();
    fireEvent.doubleClick(chip!);
    expect(onConnectionDoubleClick).toHaveBeenCalledWith("connection-a");
  });

  it("renders edge ports on hover-capable object shapes in editable mode", () => {
    const { container } = render(
      <CanvasStage document={makeDocument()} viewport={viewport} onStagePointerEvent={() => {}} />,
    );
    const ports = container.querySelectorAll('[data-canvas-object-id="process-a"][data-canvas-port]');
    expect(ports.length).toBe(4);
  });

  it("makes object affordance layers inert in hand mode and restores them in select mode", () => {
    const hand = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        selectedObjectIds={["process-a"]}
        selectedConnectionId="connection-a"
        activeTool="hand"
        onStagePointerEvent={() => {}}
      />,
    );
    const handStage = hand.container.querySelector('[data-canvas-stage="true"]') as HTMLElement | null;
    const objectLayer = hand.container.querySelector('[data-canvas-object-layer="true"]') as HTMLElement | null;
    const selectedHandle = hand.container.querySelector('[data-canvas-handle="se"]') as HTMLElement | null;
    expect(handStage?.style.cursor).toBe("grab");
    expect(objectLayer?.style.pointerEvents).toBe("none");
    expect(hand.container.querySelectorAll('[data-canvas-object-id="process-a"][data-canvas-port]').length).toBe(0);
    expect(hand.container.querySelector('[data-canvas-selection-box="true"]')).toBeTruthy();
    expect(selectedHandle?.style.pointerEvents).toBe("none");
    hand.unmount();

    const select = render(
      <CanvasStage
        document={makeDocument()}
        viewport={viewport}
        selectedObjectIds={["process-a"]}
        activeTool="select"
        onStagePointerEvent={() => {}}
      />,
    );
    const selectStage = select.container.querySelector('[data-canvas-stage="true"]') as HTMLElement | null;
    const restoredObjectLayer = select.container.querySelector('[data-canvas-object-layer="true"]') as HTMLElement | null;
    const restoredHandle = select.container.querySelector('[data-canvas-handle="se"]') as HTMLElement | null;
    expect(selectStage?.style.cursor).toContain('url("data:image/svg+xml');
    expect(selectStage?.style.cursor).toContain(", default");
    expect(restoredObjectLayer?.style.pointerEvents).toBe("");
    expect(select.container.querySelectorAll('[data-canvas-object-id="process-a"][data-canvas-port]').length).toBe(4);
    expect(restoredHandle?.style.pointerEvents).toBe("auto");
  });

  it("omits edge ports in read-only (non-editable) mode", () => {
    const { container } = render(<CanvasStage document={makeDocument()} viewport={viewport} />);
    const ports = container.querySelectorAll('[data-canvas-object-id="process-a"][data-canvas-port]');
    expect(ports.length).toBe(0);
  });
});
