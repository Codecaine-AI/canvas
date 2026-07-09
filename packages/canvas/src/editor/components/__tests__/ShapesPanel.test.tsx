import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapesPanel, SHAPES_PANEL_WIDTH_PX } from "../ShapesPanel";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../../objects/catalog";

afterEach(() => {
  cleanup();
});

describe("ShapesPanel geometry", () => {
  it("renders a full-height white panel at the expanded picker width", () => {
    const { container } = render(<ShapesPanel />);
    const panel = container.querySelector("[data-shapes-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(SHAPES_PANEL_WIDTH_PX).toBe(252);
    expect(panel.style.width).toBe(`${SHAPES_PANEL_WIDTH_PX}px`);
    expect(panel.style.height).toBe("100%");
    expect(panel.style.background).toBe("#FFFFFF");
    expect(panel.style.borderRadius).toBe("12px");
    expect(panel.style.border).toBe("1px solid rgba(0, 0, 0, 0.08)");
    expect(panel.style.boxShadow).toContain("rgba(0,0,0,0.16)");
  });

  it("animates in from the left when mounted", () => {
    const { container } = render(<ShapesPanel />);
    const panel = container.querySelector("[data-shapes-panel]") as HTMLElement;
    expect(panel.getAttribute("data-state")).toBe("open");
    expect(panel.style.animation).toContain("canvas-shapes-panel-enter");
    expect(panel.style.willChange).toBe("transform, opacity");
  });

  it("animates out to the left before reporting exit completion", () => {
    const onExitComplete = mock(() => {});
    const { container } = render(<ShapesPanel exiting onExitComplete={onExitComplete} />);
    const panel = container.querySelector("[data-shapes-panel]") as HTMLElement;

    expect(panel.getAttribute("data-state")).toBe("closing");
    expect(panel.style.animation).toContain("canvas-shapes-panel-exit");

    fireEvent.animationEnd(panel, { animationName: "canvas-shapes-panel-enter" });
    expect(onExitComplete).not.toHaveBeenCalled();

    fireEvent.animationEnd(panel, { animationName: "canvas-shapes-panel-exit" });
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the Shapes header and a close button", () => {
    const { getByText, getByLabelText } = render(<ShapesPanel />);
    expect(getByText("Shapes")).toBeTruthy();
    expect(getByLabelText("Close shapes panel")).toBeTruthy();
  });

  it("renders the search-shapes input with a purple focus ring on focus", () => {
    const { getByLabelText } = render(<ShapesPanel />);
    const input = getByLabelText("Search shapes") as HTMLInputElement;
    expect(input.style.border).not.toContain("8C2EF2");
    fireEvent.focus(input);
    expect(input.style.border).toContain("#8C2EF2");
    fireEvent.blur(input);
    expect(input.style.border).not.toContain("8C2EF2");
  });
});

describe("ShapesPanel sections", () => {
  it("renders exactly the 3 catalog category sections, in order: Basic, Flowchart, Advanced", () => {
    const { container } = render(<ShapesPanel />);
    const categories = container.querySelectorAll("[data-shape-category]");
    expect(categories.length).toBe(3);
    expect(Array.from(categories).map((c) => c.getAttribute("data-shape-category"))).toEqual([
      "basic",
      "flowchart",
      "advanced",
    ]);
  });

  it("does NOT render a Connectors section — connectors are dock-only, never a Shapes-panel entry", () => {
    const { container, queryByText } = render(<ShapesPanel />);
    expect(container.querySelector('[data-shape-category="connections"]')).toBeNull();
    expect(queryByText("Connections")).toBeNull();
    expect(queryByText("Connectors")).toBeNull();
  });

  it("collapses and expands a section's grid when its header is clicked", () => {
    const { container } = render(<ShapesPanel />);
    const header = container.querySelector('[data-section-header="Basic"]') as HTMLElement;
    expect(container.querySelector('[data-shape-grid="basic"]')).toBeTruthy();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="basic"]')).toBeNull();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="basic"]')).toBeTruthy();
  });

  it("renders the correct entry count for each section (Basic=13, Flowchart=16, Advanced=26)", () => {
    const { container } = render(<ShapesPanel />);
    for (const category of SHAPE_CATALOG) {
      const grid = container.querySelector(`[data-shape-grid="${category.id}"]`) as HTMLElement;
      expect(grid.style.gridTemplateColumns).toBe("repeat(4, 46px)");
      expect(grid.style.justifyContent).toBe("space-between");
      expect(grid.style.rowGap).toBe("6px");
      expect(grid.querySelectorAll("[data-shape-entry]").length).toBe(category.entries.length);
    }
    const basic = SHAPE_CATALOG.find((c) => c.id === "basic")!;
    const flowchart = SHAPE_CATALOG.find((c) => c.id === "flowchart")!;
    const advanced = SHAPE_CATALOG.find((c) => c.id === "advanced")!;
    expect(basic.entries.length).toBe(13);
    expect(flowchart.entries.length).toBe(16);
    expect(advanced.entries.length).toBe(26);
  });
});

describe("ShapesPanel search", () => {
  it("filters categories/entries by query and hides empty categories", () => {
    const { getByLabelText, container } = render(<ShapesPanel />);
    fireEvent.change(getByLabelText("Search shapes"), { target: { value: "hexagon" } });
    const categories = container.querySelectorAll("[data-shape-category]");
    // "Hexagon" only appears in Flowchart per the catalog data.
    expect(categories.length).toBe(1);
    expect(categories[0].getAttribute("data-shape-category")).toBe("flowchart");
  });
});

describe("ShapesPanel interaction", () => {
  it("renders larger shape targets and zooms the icon on hover", () => {
    const { container } = render(<ShapesPanel />);
    const entry = SHAPE_CATALOG.flatMap((c) => c.entries)[0];
    const button = container.querySelector(`[data-shape-entry="${entry.id}"]`) as HTMLElement;
    const iconWrap = container.querySelector(`[data-shape-icon="${entry.id}"]`) as HTMLElement;
    const icon = iconWrap.querySelector("svg") as SVGElement;

    expect(button.style.width).toBe("46px");
    expect(button.style.height).toBe("46px");
    expect(icon.getAttribute("class")).toBe("h-6 w-6");
    expect(iconWrap.style.transform).toBe("scale(1)");

    fireEvent.pointerEnter(button);

    expect(button.style.background).toBe("rgba(0, 0, 0, 0.08)");
    expect(iconWrap.style.transform).toBe("scale(1.14)");
  });

  it("shows shape tooltips below icons and aligns edge-column labels inside the panel", () => {
    const { container } = render(<ShapesPanel />);
    const basicEntries = SHAPE_CATALOG.find((c) => c.id === "basic")!.entries;
    const firstColumnButton = container.querySelector(`[data-shape-entry="${basicEntries[0].id}"]`) as HTMLElement;
    const lastColumnButton = container.querySelector(`[data-shape-entry="${basicEntries[3].id}"]`) as HTMLElement;

    fireEvent.pointerEnter(firstColumnButton);

    let tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    let caret = tooltip.querySelector("[data-chrome-tooltip-caret]") as HTMLElement;
    expect(tooltip.getAttribute("data-placement")).toBe("bottom");
    expect(tooltip.getAttribute("data-align")).toBe("start");
    expect(tooltip.style.left).toBe("0px");
    expect(tooltip.style.transform).toBe("none");
    expect(caret).toBeTruthy();
    expect(caret.style.left).toBe("23px");
    expect(caret.style.top).toBe("-6px");

    fireEvent.pointerLeave(firstColumnButton);
    fireEvent.pointerEnter(lastColumnButton);

    tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    caret = tooltip.querySelector("[data-chrome-tooltip-caret]") as HTMLElement;
    expect(tooltip.getAttribute("data-placement")).toBe("bottom");
    expect(tooltip.getAttribute("data-align")).toBe("end");
    expect(tooltip.style.right).toBe("0px");
    expect(tooltip.style.transform).toBe("none");
    expect(caret.style.left).toBe("calc(100% - 23px)");
    expect(caret.style.top).toBe("-6px");
  });

  it("fires onPick with the objectType of a clicked entry", () => {
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapesPanel onPick={onPick} />);
    const anyEntry = SHAPE_CATALOG.flatMap((c) => c.entries)[0];
    fireEvent.click(container.querySelector(`[data-shape-entry="${anyEntry.id}"]`)!);
    expect(onPick).toHaveBeenCalledWith(anyEntry.objectType);
  });

  it("clicking an Advanced entry dispatches an insert with type 'icon' and the correct glyph (via onPickEntry)", () => {
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPickEntry={onPickEntry} />);
    const advanced = SHAPE_CATALOG.find((c) => c.id === "advanced")!;
    const cpuEntry = advanced.entries.find((e) => e.icon === "cpu")!;
    expect(cpuEntry).toBeTruthy();
    fireEvent.click(container.querySelector(`[data-shape-entry="${cpuEntry.id}"]`)!);
    expect(onPickEntry).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "icon", icon: "cpu" }),
    );
  });

  it("clicking the triangle-down entry dispatches an insert with direction 'down' (via onPickEntry)", () => {
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPickEntry={onPickEntry} />);
    fireEvent.click(container.querySelector('[data-shape-entry="basic-triangle-down"]')!);
    expect(onPickEntry).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "triangle", direction: "down" }),
    );
  });

  it("both onPick and onPickEntry fire together on the same click", () => {
    const onPick = mock((_type: string) => {});
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPick={onPick} onPickEntry={onPickEntry} />);
    fireEvent.click(container.querySelector('[data-shape-entry="basic-square"]')!);
    expect(onPick).toHaveBeenCalledWith("rectangle");
    expect(onPickEntry).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = mock(() => {});
    const { getByLabelText } = render(<ShapesPanel onClose={onClose} />);
    fireEvent.click(getByLabelText("Close shapes panel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking a shape entry never fires onClose — the panel stays open in placement mode", () => {
    const onClose = mock(() => {});
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapesPanel onPick={onPick} onClose={onClose} />);
    fireEvent.click(container.querySelector('[data-shape-entry="basic-square"]')!);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ShapesPanel selected-entry highlight", () => {
  it("renders the violet selected state on the entry matching selectedEntryId only", () => {
    const { container } = render(<ShapesPanel selectedEntryId="basic-square" />);
    const selected = container.querySelector('[data-shape-entry="basic-square"]') as HTMLElement;
    const other = container.querySelector('[data-shape-entry="basic-ellipse"]') as HTMLElement;

    expect(selected.getAttribute("data-selected")).toBe("true");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.style.background).toBe("rgba(140, 46, 242, 0.12)");

    expect(other.getAttribute("data-selected")).toBeNull();
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(other.style.background).toBe("transparent");
  });

  it("selected state beats the hover wash so the armed shape stays visibly violet", () => {
    const { container } = render(<ShapesPanel selectedEntryId="basic-square" />);
    const selected = container.querySelector('[data-shape-entry="basic-square"]') as HTMLElement;
    fireEvent.pointerEnter(selected);
    expect(selected.style.background).toBe("rgba(140, 46, 242, 0.12)");
  });

  it("renders no selected state when selectedEntryId is null", () => {
    const { container } = render(<ShapesPanel selectedEntryId={null} />);
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
  });
});
