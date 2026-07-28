import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CanvasAction } from "../../../../../state/actions";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../../state/schema";
import { CanvasContextMenu } from "../CanvasContextMenu";
import type { SectionExportFormat } from "../section-export";
import {
  useCanvasContextMenu,
  type CanvasContextMenuApi,
} from "../use-canvas-context-menu";

const processObject: InteractiveCanvasObject = {
  id: "process-a",
  type: "process",
  text: "Process A",
  geometry: { x: 0, y: 0, width: 120, height: 80 },
};

const stickyObject: InteractiveCanvasObject = {
  id: "sticky-a",
  type: "sticky",
  text: "Sticky A",
  geometry: { x: 0, y: 0, width: 160, height: 160 },
};

const sectionObject: InteractiveCanvasObject = {
  id: "section-a",
  type: "section",
  text: "Section A",
  geometry: { x: 0, y: 0, width: 320, height: 220 },
};

const lockedSectionObject: InteractiveCanvasObject = {
  ...sectionObject,
  locked: "all",
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
  onMenu,
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
  onMenu?: (menu: CanvasContextMenuApi) => void;
}) {
  const canvasDocument = makeDocument(object);
  const menu = useCanvasContextMenu({
    document: canvasDocument,
    dispatch,
    screenToWorld: (point) => point,
    exportSection,
    exportBoard,
  });
  onMenu?.(menu);
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

describe("CanvasContextMenu lock gating", () => {
  it("offers both lock modes on an unlocked section", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    openObjectMenu(<ContextMenuHarness object={sectionObject} dispatch={dispatch} />);

    expect(screen.getByRole("menuitem", { name: "Lock all" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Lock background only" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Lock background only" }));
    expect(dispatch.mock.calls.at(-1)?.[0]).toEqual({
      type: "canvas.updateObject",
      objectId: "section-a",
      patch: { locked: "background" },
    });
  });

  it("offers Unlock on a locked section", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    openObjectMenu(<ContextMenuHarness object={lockedSectionObject} dispatch={dispatch} />);

    expect(screen.queryByRole("menuitem", { name: "Lock all" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unlock" }));
    expect(dispatch.mock.calls.at(-1)?.[0]).toEqual({
      type: "canvas.updateObject",
      objectId: "section-a",
      patch: { locked: undefined },
    });
  });

  // Lock protects a region of the board, so it is section-only (schema
  // objects.ts declares `locked` that way; the selection toolbar agrees).
  for (const object of [stickyObject, processObject]) {
    it(`omits every lock entry on a ${object.type}`, () => {
      const dispatch = mock((_action: CanvasAction) => {});
      openObjectMenu(<ContextMenuHarness object={object} dispatch={dispatch} />);

      // The menu is open on the non-section target…
      expect(screen.getByRole("menuitem", { name: "Copy" })).toBeTruthy();
      // …but carries no lock affordance.
      expect(screen.queryByRole("menuitem", { name: "Lock all" })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: "Lock background only" })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: "Unlock" })).toBeNull();
    });
  }

  it("no-ops setLockFromContextMenu when the target is not a section", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    let menu: CanvasContextMenuApi | null = null;
    openObjectMenu(
      <ContextMenuHarness
        object={processObject}
        dispatch={dispatch}
        onMenu={(api) => {
          menu = api;
        }}
      />,
    );

    const api = menu as CanvasContextMenuApi | null;
    expect(api?.contextObject?.id).toBe("process-a");
    act(() => {
      api?.setLockFromContextMenu("all");
      api?.setLockFromContextMenu("background");
      api?.setLockFromContextMenu(undefined);
    });

    expect(
      dispatch.mock.calls.some(([action]) => action.type === "canvas.updateObject"),
    ).toBe(false);
    // The defensive gate returns before closing the menu, so it stays open.
    expect(screen.getByRole("menu", { name: "Canvas context menu" })).toBeTruthy();
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
