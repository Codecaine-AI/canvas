import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SelectionToolbar } from "../SelectionToolbar";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
} from "../../../../objects/object-def";
import { SECTION_TOOLBAR } from "../../../../objects/section/toolbar";
import { SHAPE_TOOLBAR } from "../../../../objects/shapes/toolbar";

const SHAPE_CONTROLS = SHAPE_TOOLBAR.controls;
const SECTION_CONTROLS = SECTION_TOOLBAR.controls;
const CONNECTOR_CONTROLS = connectorDef.toolbar!.controls;
const TEXT_CONTROLS = objectDefForType("text")!.toolbar!.controls;
const STICKY_CONTROLS = objectDefForType("sticky")!.toolbar!.controls;

afterEach(() => {
  cleanup();
});

describe("SelectionToolbar geometry / styling", () => {
  it("renders the dark #1D1D1D pill at the measured 29px height with full-pill radius", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const bar = container.querySelector("[data-selection-toolbar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.background).toBe("#1D1D1D");
    expect(bar.style.height).toBe("29px");
    expect(bar.style.borderRadius).toBe("14.5px");
  });
});

describe("SelectionToolbar registry-driven control sets", () => {
  it("shape controls render exactly the 10 measured controls in order", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual([
      "shape-swap",
      "color",
      "align",
      "font-style",
      "size",
      "bold",
      "strikethrough",
      "link",
      "bullets",
      "paragraph-align",
    ]);
  });

  it("section controls render the FigJam v2 controls in order with one divider", () => {
    const { container } = render(<SelectionToolbar controls={SECTION_CONTROLS} variantLabel="section" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "section-border-style", "rename", "visibility", "lock"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(1);
  });

  it("connector controls render exactly the 6 measured controls", () => {
    const { container } = render(<SelectionToolbar controls={CONNECTOR_CONTROLS} variantLabel="connector" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "stroke", "dash", "routing", "arrowhead", "label-align"]);
  });

  it("text controls render exactly the 5 measured controls (label-edit swap)", () => {
    const { container } = render(<SelectionToolbar controls={TEXT_CONTROLS} variantLabel="text" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "font-style", "size", "bold", "strikethrough"]);
  });

  it("every selection kind resolves a non-empty control list (incl. the multi intersection)", () => {
    const kinds: Record<string, readonly unknown[]> = {
      shape: SHAPE_CONTROLS,
      section: SECTION_CONTROLS,
      connector: CONNECTOR_CONTROLS,
      text: TEXT_CONTROLS,
      sticky: STICKY_CONTROLS,
      multi: intersectToolbarControls([
        objectDefForType("text") as ObjectDef,
        objectDefForType("sticky") as ObjectDef,
      ]),
    };
    expect(Object.keys(kinds).sort()).toEqual(
      ["connector", "multi", "section", "shape", "sticky", "text"].sort(),
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
    fireEvent.click(container.querySelector('[data-toolbar-action="bold"]')!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe("bold");
  });

  it("toggles aria-expanded on flyout controls but not on plain buttons", () => {
    const { container } = render(<SelectionToolbar controls={SHAPE_CONTROLS} variantLabel="shape" />);
    const boldButton = container.querySelector('[data-toolbar-action="bold"]') as HTMLElement;
    expect(boldButton.getAttribute("aria-expanded")).toBeNull();

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
      <SelectionToolbar
        controls={SECTION_CONTROLS}
        variantLabel="section"
        onAction={onAction}
        currentColor="#C2E5FF"
        currentSectionBorderStyle="solid"
      />,
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
