import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CanvasAction } from "../../../../../state/actions";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../../state/schema";
import { CanvasContextMenu } from "../CanvasContextMenu";
import type { SectionExportFormat } from "../section-export";
import { useCanvasContextMenu } from "../use-canvas-context-menu";

const processObject: InteractiveCanvasObject = {
  id: "process-a",
  type: "process",
  text: "Process A",
  geometry: { x: 0, y: 0, width: 120, height: 80 },
};

const sectionObject: InteractiveCanvasObject = {
  id: "section-a",
  type: "section",
  text: "Section A",
  geometry: { x: 0, y: 0, width: 320, height: 220 },
};

function makeDocument(object: InteractiveCanvasObject): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "context-menu-actions",
    mode: "diagram",
    objects: [object],
    connections: [],
  };
}

function ContextMenuHarness({
  object,
  dispatch,
  exportSection,
  exportBoard,
}: {
  object: InteractiveCanvasObject;
  dispatch: (action: CanvasAction) => void;
  exportSection?: (
    document: InteractiveCanvasDocument,
    sectionId: string,
    format: SectionExportFormat,
  ) => Promise<void>;
  exportBoard?: (
    document: InteractiveCanvasDocument,
    format: SectionExportFormat,
  ) => Promise<void>;
}) {
  const canvasDocument = makeDocument(object);
  const menu = useCanvasContextMenu({
    document: canvasDocument,
    dispatch,
    screenToWorld: (point) => point,
    exportSection,
    exportBoard,
  });
  return (
    <div data-canvas-stage="true">
      <button
        type="button"
        onContextMenu={(event) =>
          menu.openObjectContextMenu(event, object, object.geometry)
        }
      >
        Open object menu
      </button>
      <button
        type="button"
        onContextMenu={(event) =>
          menu.openCanvasContextMenu(event, { x: 0, y: 0, width: 800, height: 600 })
        }
      >
        Open canvas menu
      </button>
      <CanvasContextMenu menu={menu} />
    </div>
  );
}

function openObjectMenu(ui: ReactNode) {
  render(ui);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Open object menu" }), {
    clientX: 24,
    clientY: 24,
  });
}

afterEach(() => {
  cleanup();
});

describe("CanvasContextMenu annotation authoring", () => {
  it("swaps to an autofocused input and creates an agent-request annotation on Enter", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    openObjectMenu(<ContextMenuHarness object={processObject} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Note to AI…" }));
    const input = screen.getByRole("textbox", { name: "Note to AI" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "  Clarify this step  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatch.mock.calls.at(-1)?.[0]).toEqual({
      type: "canvas.addAnnotation",
      target: { kind: "object", objectId: "process-a" },
      body: "Clarify this step",
      intent: "agent-request",
    });
    expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();
  });

  it("cancels the inline note with Escape and leaves the object menu open", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    openObjectMenu(<ContextMenuHarness object={processObject} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Note to AI…" }));
    const input = screen.getByRole("textbox", { name: "Note to AI" });
    fireEvent.change(input, { target: { value: "Do not save" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByRole("menuitem", { name: "Note to AI…" })).toBeTruthy();
    expect(dispatch.mock.calls.some(([action]) => action.type === "canvas.addAnnotation")).toBe(false);
  });
});

describe("CanvasContextMenu section export", () => {
  it("offers the board's SVG and PNG formats and exports the section crop", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const exportSection = mock(
      async (
        _document: InteractiveCanvasDocument,
        _sectionId: string,
        _format: SectionExportFormat,
      ) => {},
    );
    openObjectMenu(
      <ContextMenuHarness
        object={sectionObject}
        dispatch={dispatch}
        exportSection={exportSection}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Export section…" }));
    expect(screen.getByRole("menuitem", { name: "Export as SVG" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Export as PNG" }));

    expect(exportSection).toHaveBeenCalledTimes(1);
    expect(exportSection.mock.calls[0]?.[1]).toBe("section-a");
    expect(exportSection.mock.calls[0]?.[2]).toBe("png");
    expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();
  });
});

describe("CanvasContextMenu board export", () => {
  it("offers the former top-bar SVG and PNG formats from the empty canvas menu", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const exportBoard = mock(
      async (
        _document: InteractiveCanvasDocument,
        _format: SectionExportFormat,
      ) => {},
    );
    render(
      <ContextMenuHarness
        object={processObject}
        dispatch={dispatch}
        exportBoard={exportBoard}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "Open canvas menu" }), {
      clientX: 24,
      clientY: 24,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Export board…" }));
    expect(screen.getByRole("menuitem", { name: "Export as SVG" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Export as PNG" }));

    expect(exportBoard).toHaveBeenCalledTimes(1);
    expect(exportBoard.mock.calls[0]?.[0].id).toBe("context-menu-actions");
    expect(exportBoard.mock.calls[0]?.[1]).toBe("png");
    expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();
  });
});
