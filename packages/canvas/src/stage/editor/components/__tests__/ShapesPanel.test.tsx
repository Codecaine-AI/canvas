import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapesPanel, SHAPES_PANEL_WIDTH_PX } from "../ShapesPanel";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../../../objects/catalog";
import {
  ICON_GLYPHS,
  ICON_GLYPH_CATEGORIES,
  ICON_GLYPH_IDS,
} from "../../../../objects/shapes/icon/icon-glyphs";

afterEach(() => {
  cleanup();
});

/** The rendered icon groups, in DOM order: category id + the glyph ids inside it. */
function renderedIconGroups(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-icon-category]")).map((group) => ({
    category: group.getAttribute("data-icon-category"),
    glyphs: Array.from(group.querySelectorAll("[data-shape-entry]")).map((button) =>
      button.getAttribute("data-icon"),
    ),
  }));
}

/** Roster glyph ids in `category`, roster order. */
function glyphsIn(category: string) {
  return ICON_GLYPH_IDS.filter((glyph) => ICON_GLYPHS[glyph].category === category);
}

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
    const { getAllByText, getByLabelText } = render(<ShapesPanel />);
    // "Shapes" appears twice: the panel header and the shape section label.
    expect(getAllByText("Shapes").length).toBeGreaterThanOrEqual(1);
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
  it("renders exactly the 2 catalog category sections, in order: Icons, Shapes", () => {
    const { container } = render(<ShapesPanel />);
    const categories = container.querySelectorAll("[data-shape-category]");
    expect(categories.length).toBe(2);
    expect(Array.from(categories).map((c) => c.getAttribute("data-shape-category"))).toEqual([
      "icons",
      "shapes",
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
    const header = container.querySelector('[data-section-header="Icons"]') as HTMLElement;
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeTruthy();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeNull();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeTruthy();
  });

  it("renders the correct entry count for each section (Shapes=10)", () => {
    const { container } = render(<ShapesPanel />);
    for (const category of SHAPE_CATALOG) {
      const section = container.querySelector(`[data-shape-grid="${category.id}"]`) as HTMLElement;
      expect(section.querySelectorAll("[data-shape-entry]").length).toBe(category.entries.length);
      // Icons hold one 4-column grid per icon category; Shapes is one grid.
      const grids =
        category.id === "icons"
          ? Array.from(section.querySelectorAll<HTMLElement>("[data-icon-grid]"))
          : [section];
      expect(grids.length).toBeGreaterThan(0);
      for (const grid of grids) {
        expect(grid.style.gridTemplateColumns).toBe("repeat(4, 46px)");
        expect(grid.style.justifyContent).toBe("space-between");
        expect(grid.style.rowGap).toBe("6px");
      }
    }
    const shapes = SHAPE_CATALOG.find((c) => c.id === "shapes")!;
    expect(shapes.entries.length).toBe(10);
  });

  it("groups icons by category in ICON_GLYPH_CATEGORIES order, brands last, every glyph exactly once", () => {
    const { container, getByRole } = render(<ShapesPanel />);
    const groups = renderedIconGroups(container);

    const expected = ICON_GLYPH_CATEGORIES.map((category) => ({
      category: category.id,
      glyphs: glyphsIn(category.id),
    })).filter((group) => group.glyphs.length > 0);
    expect(groups).toEqual(expected);
    expect(groups.at(-1)?.category).toBe("brands");

    const rendered = groups.flatMap((group) => group.glyphs);
    expect(rendered.length).toBe(ICON_GLYPH_IDS.length);
    expect(new Set(rendered)).toEqual(new Set(ICON_GLYPH_IDS));

    // Each group is labeled by its category's visible sub-heading.
    const brands = getByRole("group", { name: "Brands" });
    expect(brands.textContent).toContain("Brands");
  });
});

describe("ShapesPanel search", () => {
  it("filters categories/entries by query and hides empty categories", () => {
    const { getByLabelText, container } = render(<ShapesPanel />);
    fireEvent.change(getByLabelText("Search shapes"), { target: { value: "octagon" } });
    const categories = container.querySelectorAll("[data-shape-category]");
    // "Octagon" only appears in Shapes per the catalog data.
    expect(categories.length).toBe(1);
    expect(categories[0].getAttribute("data-shape-category")).toBe("shapes");
  });

  it('"brand" lists every brand and nothing else, still grouped', () => {
    const { getByLabelText, container } = render(<ShapesPanel />);
    fireEvent.change(getByLabelText("Search shapes"), { target: { value: "brand" } });

    const categories = Array.from(container.querySelectorAll("[data-shape-category]")).map((c) =>
      c.getAttribute("data-shape-category"),
    );
    expect(categories).toEqual(["icons"]);
    expect(renderedIconGroups(container)).toEqual([
      { category: "brands", glyphs: glyphsIn("brands") },
    ]);
  });

  it("lists a whole icon category when the query matches the category's name", () => {
    const { getByLabelText, container } = render(<ShapesPanel />);
    const search = getByLabelText("Search shapes");

    // The whole group, not just the glyph that is also named "Network".
    fireEvent.change(search, { target: { value: "network" } });
    expect(renderedIconGroups(container)).toEqual([
      { category: "network", glyphs: glyphsIn("network") },
    ]);

    // "control" appears only in the "Status & control" label.
    fireEvent.change(search, { target: { value: "Control" } });
    expect(renderedIconGroups(container)).toEqual([
      { category: "status", glyphs: glyphsIn("status") },
    ]);
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
    // Columns count within each icon-category grid: the second grid's first
    // button is column 0 even when the first grid's last row is partial.
    const [firstGrid, secondGrid] = Array.from(container.querySelectorAll("[data-icon-grid]"));
    const firstColumnButton = secondGrid.querySelector("[data-shape-entry]") as HTMLElement;
    const lastColumnButton = firstGrid.querySelectorAll<HTMLElement>("[data-shape-entry]")[3];

    fireEvent.pointerEnter(firstColumnButton);

    let tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    let caret = tooltip.querySelector("[data-trim-tooltip-caret]") as HTMLElement;
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
    caret = tooltip.querySelector("[data-trim-tooltip-caret]") as HTMLElement;
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

  it("clicking an icon entry dispatches an insert with type 'icon' and the correct glyph (via onPickEntry)", () => {
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPickEntry={onPickEntry} />);
    const icons = SHAPE_CATALOG.find((c) => c.id === "icons")!;
    const modelEntry = icons.entries.find((e) => e.icon === "model")!;
    expect(modelEntry).toBeTruthy();
    fireEvent.click(container.querySelector(`[data-shape-entry="${modelEntry.id}"]`)!);
    expect(onPickEntry).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "icon", icon: "model" }),
    );
  });

  it("clicking the triangle-down entry dispatches an insert with direction 'down' (via onPickEntry)", () => {
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPickEntry={onPickEntry} />);
    fireEvent.click(container.querySelector('[data-shape-entry="shape-triangle-down"]')!);
    expect(onPickEntry).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: "triangle", direction: "down" }),
    );
  });

  it("both onPick and onPickEntry fire together on the same click", () => {
    const onPick = mock((_type: string) => {});
    const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
    const { container } = render(<ShapesPanel onPick={onPick} onPickEntry={onPickEntry} />);
    fireEvent.click(container.querySelector('[data-shape-entry="shape-square"]')!);
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
    fireEvent.click(container.querySelector('[data-shape-entry="shape-square"]')!);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ShapesPanel selected-entry highlight", () => {
  it("renders the violet selected state on the entry matching selectedEntryId only", () => {
    const { container } = render(<ShapesPanel selectedEntryId="shape-square" />);
    const selected = container.querySelector('[data-shape-entry="shape-square"]') as HTMLElement;
    const other = container.querySelector('[data-shape-entry="shape-ellipse"]') as HTMLElement;

    expect(selected.getAttribute("data-selected")).toBe("true");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.style.background).toBe("rgba(140, 46, 242, 0.12)");

    expect(other.getAttribute("data-selected")).toBeNull();
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(other.style.background).toBe("transparent");
  });

  it("selected state beats the hover wash so the armed shape stays visibly violet", () => {
    const { container } = render(<ShapesPanel selectedEntryId="shape-square" />);
    const selected = container.querySelector('[data-shape-entry="shape-square"]') as HTMLElement;
    fireEvent.pointerEnter(selected);
    expect(selected.style.background).toBe("rgba(140, 46, 242, 0.12)");
  });

  it("renders no selected state when selectedEntryId is null", () => {
    const { container } = render(<ShapesPanel selectedEntryId={null} />);
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
  });
});
