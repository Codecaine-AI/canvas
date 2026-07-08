import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { SelectionToolbar } from "../SelectionToolbar";
import { SelectionToolbarLayer } from "../SelectionToolbarLayer";
import { resolveConnectorControlState } from "../connector-control-state";
import type { SelectionToolbarApi } from "../use-selection-toolbar";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
} from "../../../../objects/object-def";
import { SECTION_TOOLBAR } from "../../../../objects/section/toolbar";
import { SHAPE_TOOLBAR } from "../../../../objects/shapes/toolbar";
import type { InteractiveCanvasConnection } from "../../../../state/schema";

const SHAPE_CONTROLS = SHAPE_TOOLBAR.controls;
const SECTION_CONTROLS = SECTION_TOOLBAR.controls;
const CONNECTOR_CONTROLS = connectorDef.toolbar.controls; // ConnectorDef (D19): toolbar is a required field
const STICKY_CONTROLS = objectDefForType("sticky")!.toolbar!.controls;

afterEach(() => {
  cleanup();
});

function connection(overrides: Partial<InteractiveCanvasConnection> = {}): InteractiveCanvasConnection {
  return {
    id: "connection-a",
    from: { objectId: "a", anchor: "right" },
    to: { objectId: "b", anchor: "left" },
    ...overrides,
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
    expect(actions).toEqual(["shape-swap", "color", "text"]);
  });

  it("sticky controls render color and text in registry order", () => {
    const { container } = render(<SelectionToolbar controls={STICKY_CONTROLS} variantLabel="sticky" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "text"]);
  });

  it("section controls render the FigJam v2 controls in order with one divider", () => {
    const { container } = render(<SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "section-border-style", "rename", "lock"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(1);
  });

  it("connector controls render exactly the 3 connector controls", () => {
    const { container } = render(<SelectionToolbar controls={CONNECTOR_CONTROLS} variantLabel="connector" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "dash", "arrowhead"]);
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

  it("toggles aria-expanded on flyout controls but not on plain buttons", () => {
    const { container } = render(<SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" />);
    const renameButton = container.querySelector('[data-toolbar-action="rename"]') as HTMLElement;
    expect(renameButton.getAttribute("aria-expanded")).toBeNull();

    const colorButton = container.querySelector('[data-toolbar-action="color"]') as HTMLElement;
    expect(colorButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(colorButton);
    expect(colorButton.getAttribute("aria-expanded")).toBe("true");
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
