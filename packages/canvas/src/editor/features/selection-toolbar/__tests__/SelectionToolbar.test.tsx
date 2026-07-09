import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { SelectionToolbar } from "../SelectionToolbar";
import { SelectionToolbarLayer } from "../SelectionToolbarLayer";
import { resolveConnectorControlState } from "../connector-control-state";
import { useSelectionToolbar } from "../use-selection-toolbar";
import type { SelectionToolbarApi } from "../use-selection-toolbar";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
} from "../../../../objects/object-def";
import { SECTION_TOOLBAR } from "../../../../objects/section/toolbar";
import { SHAPE_TOOLBAR } from "../../../../objects/shapes/toolbar";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
} from "../../../../state/actions";
import { sectionFitGeometry } from "../../../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasDocument } from "../../../../state/schema";

const SHAPE_CONTROLS = SHAPE_TOOLBAR.controls;
const SECTION_CONTROLS = SECTION_TOOLBAR.controls;
const CONNECTOR_CONTROLS = connectorDef.toolbar.controls; // ConnectorDef (D19): toolbar is a required field
const STICKY_CONTROLS = objectDefForType("sticky")!.toolbar!.controls;

type RafGlobal = typeof globalThis & {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
};

const rafGlobal = globalThis as RafGlobal;
const originalRequestAnimationFrame = rafGlobal.requestAnimationFrame;
const originalCancelAnimationFrame = rafGlobal.cancelAnimationFrame;

afterEach(() => {
  cleanup();
  rafGlobal.requestAnimationFrame = originalRequestAnimationFrame;
  rafGlobal.cancelAnimationFrame = originalCancelAnimationFrame;
});

function connection(overrides: Partial<InteractiveCanvasConnection> = {}): InteractiveCanvasConnection {
  return {
    id: "connection-a",
    from: { objectId: "a", anchor: "right" },
    to: { objectId: "b", anchor: "left" },
    ...overrides,
  };
}

function toolbarDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "toolbar-test-doc",
    mode: "diagram",
    objects: [
      {
        id: "a",
        type: "process",
        text: "A",
        geometry: { x: 0, y: 0, width: 120, height: 80 },
      },
      {
        id: "b",
        type: "process",
        text: "B",
        geometry: { x: 240, y: 0, width: 120, height: 80 },
      },
    ],
    connections: [connection()],
  };
}

function sectionToolbarDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-toolbar-action-test-doc",
    mode: "diagram",
    objects: [
      {
        id: "section-a",
        type: "section",
        text: "Section A",
        geometry: { x: 100, y: 80, width: 520, height: 360 },
        style: { shape: "section" },
      },
      {
        id: "child-a",
        type: "process",
        text: "Child A",
        parentId: "section-a",
        geometry: { x: 260, y: 220, width: 120, height: 80 },
      },
    ],
    connections: [],
  };
}

function actionIconSvg(container: HTMLElement, action: string): SVGSVGElement {
  const button = container.querySelector(`[data-toolbar-action="${action}"]`);
  const svg = button?.querySelector("svg");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function actionIconPathData(container: HTMLElement, action: string): readonly (string | null)[] {
  return Array.from(actionIconSvg(container, action).querySelectorAll("path")).map((path) =>
    path.getAttribute("d"),
  );
}

function connectorToolbarApi(overrides: Partial<SelectionToolbarApi> = {}): SelectionToolbarApi {
  return {
    selectionToolbarRef: createRef<HTMLDivElement>(),
    selectionToolbarVariant: "connector",
    selectionToolbarVariantLabel: "connector",
    selectionToolbarControls: CONNECTOR_CONTROLS,
    selectionToolbarFlyouts: null,
    selectionSignature: "connector:connection-a:",
    selectionToolbarPosition: { x: 0, y: 0, placement: "above" },
    openFlyout: null,
    setOpenFlyout: () => undefined,
    selectedObjectsForToolbar: [],
    primarySelectedObject: undefined,
    primarySectionFitted: false,
    handleSelectionToolbarAction: () => undefined,
    applyColorToSelection: () => undefined,
    setLockForSelection: () => undefined,
    applySectionBorderStyleToSelection: () => undefined,
    swapSelectedShape: () => undefined,
    ...overrides,
  };
}

describe("SelectionToolbar geometry / styling", () => {
  it("renders the dark #1D1D1D bar at the 48px height with rounded-rect radius", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const bar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.background).toBe("#1D1D1D");
    expect(bar.style.height).toBe("48px");
    expect(bar.style.borderRadius).toBe("14px");
  });

  it("applies the FigJam elevation and entrance animation to the toolbar pill", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const bar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.boxShadow).toContain("0 0 0 0.5px");
    expect(bar.style.boxShadow).toContain("0 2px 5px");
    expect(bar.style.boxShadow).toContain("0 6px 18px");
    expect(bar.style.animation).toContain("canvas-selection-toolbar-enter");
  });
});

describe("SelectionToolbar registry-driven control sets", () => {
  it("shape controls render exactly the 3 measured controls in order", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "text", "shape-swap"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(1);
  });

  it("sticky controls render color and text in registry order", () => {
    const { container } = render(<SelectionToolbar controls={STICKY_CONTROLS} variantLabel="sticky" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "text"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(0);
  });

  it("section controls render the FigJam v2 controls in order with two dividers", () => {
    const { container } = render(<SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "rename", "fit-children", "section-border-style", "lock"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(2);
  });

  it("connector controls render the 4 connector controls", () => {
    const { container } = render(<SelectionToolbar controls={CONNECTOR_CONTROLS} variantLabel="connector" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "text", "dash", "arrowhead"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(1);
  });

  it("every selection kind resolves a non-empty control list (incl. the multi intersection)", () => {
    const kinds: Record<string, readonly unknown[]> = {
      shape: SHAPE_CONTROLS,
      section: SECTION_CONTROLS,
      connector: CONNECTOR_CONTROLS,
      sticky: STICKY_CONTROLS,
      multi: intersectToolbarControls([
        objectDefForType("process") as ObjectDef,
        objectDefForType("sticky") as ObjectDef,
      ]),
    };
    expect(Object.keys(kinds).sort()).toEqual(
      ["connector", "multi", "section", "shape", "sticky"].sort(),
    );
    for (const controls of Object.values(kinds)) {
      expect(controls.length).toBeGreaterThan(0);
    }
  });
});

describe("SelectionToolbar interaction", () => {
  it("fires onAction with the control's action id on click", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(
      <SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" onAction={onAction} />,
    );
    fireEvent.click(container.querySelector('[data-toolbar-action="shape-swap"]')!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe("shape-swap");
  });

  it("text is a plain Edit text button that fires the text action", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(
      <SelectionToolbar controls={STICKY_CONTROLS} variantLabel="sticky" onAction={onAction} />,
    );
    const textButton = container.querySelector('[data-toolbar-action="text"]') as HTMLElement;
    expect(textButton.getAttribute("aria-label")).toBe("Edit text");
    expect(textButton.getAttribute("aria-expanded")).toBeNull();

    fireEvent.click(textButton);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe("text");
  });

  it("connector text is a plain Text button that fires the text action", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(
      <SelectionToolbar controls={CONNECTOR_CONTROLS} variantLabel="connector" onAction={onAction} />,
    );
    const textButton = container.querySelector('[data-toolbar-action="text"]') as HTMLElement;
    expect(textButton.getAttribute("aria-label")).toBe("Text");
    expect(textButton.getAttribute("aria-expanded")).toBeNull();

    fireEvent.click(textButton);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe("text");
  });

  it("opens connector label editing from the connector text action", () => {
    const document = toolbarDocument();
    const openObjectTextEditor = mock((_objectId: string) => {});
    const openConnectionLabelEditor = mock((_connectionId: string) => {});
    const { result } = renderHook(() =>
      useSelectionToolbar({
        document,
        dispatch: () => undefined,
        selection: { kind: "connection", connectionId: "connection-a" },
        selectedIds: [],
        selectedConnection: document.connections[0],
        selectedConnectionId: "connection-a",
        viewport: { x: 0, y: 0, zoom: 1 },
        stageRef: createRef<HTMLDivElement>(),
        openObjectTextEditor,
        openConnectionLabelEditor,
      }),
    );

    act(() => {
      result.current.handleSelectionToolbarAction("text");
    });

    expect(openConnectionLabelEditor).toHaveBeenCalledWith("connection-a");
    expect(openObjectTextEditor).toHaveBeenCalledTimes(0);
  });

  it("fits the selected section from the fit-children action", () => {
    rafGlobal.requestAnimationFrame = undefined;
    rafGlobal.cancelAnimationFrame = undefined;
    const document = sectionToolbarDocument();
    const dispatch = mock((_action: CanvasAction) => {});
    const { result } = renderHook(() =>
      useSelectionToolbar({
        document,
        dispatch,
        selection: { kind: "objects", objectIds: ["section-a"] },
        selectedIds: ["section-a"],
        selectedConnection: undefined,
        selectedConnectionId: null,
        viewport: { x: 0, y: 0, zoom: 1 },
        stageRef: createRef<HTMLDivElement>(),
        openObjectTextEditor: mock((_objectId: string) => {}),
        openConnectionLabelEditor: mock((_connectionId: string) => {}),
      }),
    );

    act(() => {
      result.current.handleSelectionToolbarAction("fit-children");
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.fitSectionToChildren",
      sectionId: "section-a",
    });
  });

  it("toggles aria-expanded on flyout controls but not on plain buttons", () => {
    const { container } = render(<SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" />);
    const renameButton = container.querySelector('[data-toolbar-action="rename"]') as HTMLElement;
    expect(renameButton.getAttribute("aria-expanded")).toBeNull();
    expect(renameButton.style.background.replace(/\s/g, "")).not.toBe("rgba(255,255,255,0.16)");

    const colorButton = container.querySelector('[data-toolbar-action="color"]') as HTMLElement;
    expect(colorButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(colorButton);
    expect(colorButton.getAttribute("aria-expanded")).toBe("true");
    expect(colorButton.style.background.replace(/\s/g, "")).toBe("rgba(255,255,255,0.16)");
  });

  it("shows a tooltip with the control's label on hover", () => {
    const { container, queryByRole } = render(
      <SelectionToolbar controls={CONNECTOR_CONTROLS} variantLabel="connector" />,
    );
    const dashButton = container.querySelector('[data-toolbar-action="dash"]') as HTMLElement;
    fireEvent.mouseEnter(dashButton);
    expect(queryByRole("tooltip")?.textContent).toBe("Line style");
  });

  it("section style controls are editor-owned flyouts", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(
      <SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" onAction={onAction} />,
    );
    const fill = container.querySelector('[data-toolbar-action="color"]')!;
    const border = container.querySelector('[data-toolbar-action="section-border-style"]')!;

    fireEvent.click(fill);
    expect(onAction.mock.calls.at(-1)).toEqual(["color"]);
    expect(fill.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-color-palette-popover]")).toBeNull();

    fireEvent.click(container.querySelector('[data-toolbar-action="section-border-style"]')!);
    expect(onAction.mock.calls.at(-1)).toEqual(["section-border-style"]);
    expect(border.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-color-palette-popover]")).toBeNull();
  });
});

describe("SelectionToolbarLayer visibility", () => {
  it("renders null when hidden is true even with a valid toolbar and position", () => {
    const { container } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi()}
        selectedConnection={connection()}
        dispatch={() => undefined}
        hidden
      />,
    );

    expect(container.querySelector("[data-selection-toolbar]")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders null while the connector tool is active even with a valid toolbar and position", () => {
    const { container } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi()}
        selectedConnection={connection()}
        dispatch={() => undefined}
        activeTool="connector"
      />,
    );

    expect(container.querySelector("[data-selection-toolbar]")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("closes an open flyout when hidden flips true", () => {
    const setOpenFlyout = mock((_action: Parameters<SelectionToolbarApi["setOpenFlyout"]>[0]) => {});
    const { rerender } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({ openFlyout: "color", setOpenFlyout })}
        selectedConnection={connection()}
        dispatch={() => undefined}
      />,
    );
    expect(setOpenFlyout).toHaveBeenCalledTimes(0);

    rerender(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({ openFlyout: "color", setOpenFlyout })}
        selectedConnection={connection()}
        dispatch={() => undefined}
        hidden
      />,
    );

    expect(setOpenFlyout).toHaveBeenCalledTimes(1);
    expect(setOpenFlyout.mock.calls[0]).toEqual([null]);
  });

  it("renders again as a fresh toolbar mount when hidden flips back false", () => {
    const { container, rerender } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({ selectionSignature: "connector:connection-a:" })}
        selectedConnection={connection()}
        dispatch={() => undefined}
      />,
    );
    const firstToolbar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(firstToolbar).toBeTruthy();

    rerender(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({ selectionSignature: "connector:connection-a:" })}
        selectedConnection={connection()}
        dispatch={() => undefined}
        hidden
      />,
    );
    expect(container.querySelector("[data-selection-toolbar]")).toBeNull();

    rerender(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({ selectionSignature: "connector:connection-a:" })}
        selectedConnection={connection()}
        dispatch={() => undefined}
      />,
    );

    const secondToolbar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(secondToolbar).toBeTruthy();
    expect(secondToolbar).not.toBe(firstToolbar);
  });
});

describe("SelectionToolbar connector current-value icons", () => {
  const arrowIcons = [
    { arrow: "none", paths: ["M3 9H15"] },
    { arrow: "forward", paths: ["M3 9H12.5", "M15 9L11 6.5V11.5Z"] },
    { arrow: "back", paths: ["M5.5 9H15", "M3 9L7 6.5V11.5Z"] },
    {
      arrow: "both",
      paths: ["M5.5 9H12.5", "M3 9L7 6.5V11.5Z", "M15 9L11 6.5V11.5Z"],
    },
  ] as const;

  for (const { arrow, paths } of arrowIcons) {
    it(`arrowhead button reflects ${arrow}`, () => {
      const { container } = render(
        <SelectionToolbar
          controls={CONNECTOR_CONTROLS}
          variantLabel="connector"
          controlState={resolveConnectorControlState([connection({ arrow })])}
        />,
      );

      expect(actionIconPathData(container, "arrowhead")).toEqual(paths);
    });
  }

  it("dash button reflects solid and dashed connector styles", () => {
    const solid = render(
      <SelectionToolbar
        controls={CONNECTOR_CONTROLS}
        variantLabel="connector"
        controlState={resolveConnectorControlState([connection({ style: "solid" })])}
      />,
    );
    expect(
      actionIconSvg(solid.container, "dash").querySelector("path")?.getAttribute("stroke-dasharray"),
    ).toBeNull();
    solid.unmount();

    const dashed = render(
      <SelectionToolbar
        controls={CONNECTOR_CONTROLS}
        variantLabel="connector"
        controlState={resolveConnectorControlState([connection({ style: "dashed" })])}
      />,
    );
    expect(
      actionIconSvg(dashed.container, "dash").querySelector("path")?.getAttribute("stroke-dasharray"),
    ).toBe("3 2");
  });

  it("mixed connector selections fall back to the default connector glyphs", () => {
    const { container } = render(
      <SelectionToolbar
        controls={CONNECTOR_CONTROLS}
        variantLabel="connector"
        controlState={resolveConnectorControlState([
          connection({ id: "connection-a", style: "dashed", arrow: "both" }),
          connection({ id: "connection-b", style: "solid", arrow: "none" }),
        ])}
      />,
    );

    expect(actionIconSvg(container, "dash").querySelector("path")?.getAttribute("stroke-dasharray")).toBeNull();
    expect(actionIconPathData(container, "arrowhead")).toEqual([
      "M3 9H12.5",
      "M15 9L11 6.5V11.5Z",
    ]);
  });

  it("treats absent connector fields as their schema defaults", () => {
    const { container } = render(
      <SelectionToolbar
        controls={CONNECTOR_CONTROLS}
        variantLabel="connector"
        controlState={resolveConnectorControlState([
          connection({ id: "connection-a" }),
          connection({ id: "connection-b", style: "solid", arrow: "forward" }),
        ])}
      />,
    );

    expect(actionIconSvg(container, "dash").querySelector("path")?.getAttribute("stroke-dasharray")).toBeNull();
    expect(actionIconPathData(container, "arrowhead")).toEqual([
      "M3 9H12.5",
      "M15 9L11 6.5V11.5Z",
    ]);
  });

  it("layer feeds selected connector values into collapsed toolbar buttons", () => {
    const { container } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi()}
        selectedConnection={connection({ style: "dashed", arrow: "back", color: "blue" })}
        dispatch={() => undefined}
      />,
    );

    expect(
      actionIconSvg(container, "dash").querySelector("path")?.getAttribute("stroke-dasharray"),
    ).toBe("3 2");
    expect(actionIconPathData(container, "arrowhead")).toEqual([
      "M5.5 9H15",
      "M3 9L7 6.5V11.5Z",
    ]);
    expect(actionIconSvg(container, "color").querySelector("circle")?.getAttribute("fill")).toBe("#0D99FF");
  });

  it("remounts the toolbar pill on selection identity changes but not position changes", () => {
    const firstConnection = connection({ id: "connection-a" });
    const { container, rerender } = render(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({
          selectionSignature: "connector:connection-a:",
          selectionToolbarPosition: { x: 0, y: 0, placement: "above" },
        })}
        selectedConnection={firstConnection}
        dispatch={() => undefined}
      />,
    );
    const firstToolbar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(firstToolbar).toBeTruthy();

    rerender(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({
          selectionSignature: "connector:connection-a:",
          selectionToolbarPosition: { x: 72, y: 40, placement: "above" },
        })}
        selectedConnection={firstConnection}
        dispatch={() => undefined}
      />,
    );
    expect(container.querySelector("[data-selection-toolbar]")).toBe(firstToolbar);

    rerender(
      <SelectionToolbarLayer
        toolbar={connectorToolbarApi({
          selectionSignature: "connector:connection-b:",
          selectionToolbarPosition: { x: 72, y: 40, placement: "above" },
        })}
        selectedConnection={connection({ id: "connection-b" })}
        dispatch={() => undefined}
      />,
    );
    expect(container.querySelector("[data-selection-toolbar]")).not.toBe(firstToolbar);
  });
});

function sectionToolbarDocumentWithGeometry(
  geometry: InteractiveCanvasDocument["objects"][number]["geometry"],
): InteractiveCanvasDocument {
  return {
    ...sectionToolbarDocument(),
    objects: sectionToolbarDocument().objects.map((object) =>
      object.id === "section-a" ? { ...object, geometry } : object,
    ),
  };
}

function fittedSectionToolbarDocument(): InteractiveCanvasDocument {
  let state = createInteractiveCanvasState(sectionToolbarDocument());
  const targetGeometry = sectionFitGeometry(state.document, "section-a");
  expect(targetGeometry).toBeTruthy();
  state = reduceInteractiveCanvasState(state, {
    type: "canvas.fitSectionToChildren",
    sectionId: "section-a",
  });
  const section = state.document.objects.find((object) => object.id === "section-a");
  expect(section?.geometry).toEqual(targetGeometry);
  return state.document;
}

function stageRefForToolbarLayer() {
  const stage = globalThis.document.createElement("div");
  stage.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 1200,
      height: 900,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 900,
      toJSON: () => ({}),
    }) as DOMRect;
  return { current: stage };
}

function renderSectionToolbarLayer(document: InteractiveCanvasDocument) {
  const { result } = renderHook(() =>
    useSelectionToolbar({
      document,
      dispatch: () => undefined,
      selection: { kind: "objects", objectIds: ["section-a"] },
      selectedIds: ["section-a"],
      selectedConnection: undefined,
      selectedConnectionId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      stageRef: stageRefForToolbarLayer(),
      openObjectTextEditor: mock((_objectId: string) => {}),
      openConnectionLabelEditor: mock((_connectionId: string) => {}),
    }),
  );
  return render(
    <SelectionToolbarLayer
      toolbar={result.current}
      selectedConnection={undefined}
      dispatch={() => undefined}
    />,
  );
}

describe("SelectionToolbar section fit disabled state", () => {
  it("renders disabled fit-children controls without firing onAction", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(
      <SelectionToolbar
        controls={SECTION_CONTROLS}
        variantLabel="section"
        onAction={onAction}
        controlState={{ "fit-children": { disabled: true } }}
      />,
    );
    const fitButton = container.querySelector(
      '[data-toolbar-action="fit-children"]',
    ) as HTMLButtonElement;

    expect(fitButton.disabled).toBe(true);
    expect(fitButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(fitButton);
    expect(onAction).toHaveBeenCalledTimes(0);
  });

  it("disables fit-children in layer controlState only when the section is already fitted", () => {
    const fitted = renderSectionToolbarLayer(fittedSectionToolbarDocument());
    const fittedButton = fitted.container.querySelector(
      '[data-toolbar-action="fit-children"]',
    ) as HTMLButtonElement;
    expect(fittedButton.disabled).toBe(true);

    const oversized = renderSectionToolbarLayer(sectionToolbarDocument());
    const oversizedButton = oversized.container.querySelector(
      '[data-toolbar-action="fit-children"]',
    ) as HTMLButtonElement;
    expect(oversizedButton.disabled).toBe(false);

    const undersized = renderSectionToolbarLayer(
      sectionToolbarDocumentWithGeometry({ x: 280, y: 230, width: 40, height: 30 }),
    );
    const undersizedButton = undersized.container.querySelector(
      '[data-toolbar-action="fit-children"]',
    ) as HTMLButtonElement;
    expect(undersizedButton.disabled).toBe(false);
  });

  it("renders the section border-style icon without a color override", () => {
    const { container } = renderSectionToolbarLayer(sectionToolbarDocument());
    const borderIcon = actionIconSvg(container, "section-border-style");
    const iconColorWrapper = borderIcon.parentElement as HTMLElement;

    expect(iconColorWrapper.style.color).toBe("");
  });
});
