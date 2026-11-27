import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { cssVar } from "@codecaine-ai/design-system";
import { ShapesPanel } from "../ShapesPanel";
import { type ShapeCatalogEntry } from "../../../../objects/catalog";
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
});

describe("ShapesPanel sections", () => {
  it("collapses and expands a section's grid when its header is clicked", () => {
    const { container } = render(<ShapesPanel />);
    const header = container.querySelector('[data-section-header="Icons"]') as HTMLElement;
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeTruthy();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeNull();
    fireEvent.click(header);
    expect(container.querySelector('[data-shape-grid="icons"]')).toBeTruthy();
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

    // "brand" lists every brand and nothing else, still grouped under icons.
    fireEvent.change(search, { target: { value: "brand" } });
    const categories = Array.from(container.querySelectorAll("[data-shape-category]")).map((c) =>
      c.getAttribute("data-shape-category"),
    );
    expect(categories).toEqual(["icons"]);
    expect(renderedIconGroups(container)).toEqual([
      { category: "brands", glyphs: glyphsIn("brands") },
    ]);
  });
});

describe("ShapesPanel interaction", () => {
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

  it.each([
    ['[data-shape-entry="shape-square"]', "rectangle", { objectType: "rectangle" }],
    ['[data-shape-entry="shape-triangle-down"]', "triangle", { objectType: "triangle", direction: "down" }],
    ['[data-shape-entry][data-icon="model"]', "icon", { objectType: "icon", icon: "model" }],
  ])(
    "both onPick and onPickEntry fire together on the same click, with the entry's insert fields (%s)",
    (selector, expectedType, expectedEntry) => {
      const onPick = mock((_type: string) => {});
      const onPickEntry = mock((_entry: ShapeCatalogEntry) => {});
      const { container } = render(<ShapesPanel onPick={onPick} onPickEntry={onPickEntry} />);
      fireEvent.click(container.querySelector(selector)!);
      expect(onPick).toHaveBeenCalledWith(expectedType);
      expect(onPickEntry).toHaveBeenCalledTimes(1);
      expect(onPickEntry.mock.calls[0][0]).toEqual(expect.objectContaining(expectedEntry));
    },
  );

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
  it("renders the accent selected state on the entry matching selectedEntryId only", () => {
    const { container } = render(<ShapesPanel selectedEntryId="shape-square" />);
    const selected = container.querySelector('[data-shape-entry="shape-square"]') as HTMLElement;
    const other = container.querySelector('[data-shape-entry="shape-ellipse"]') as HTMLElement;

    expect(selected.getAttribute("data-selected")).toBe("true");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.style.background).toBe(cssVar("color.fill.accent"));

    expect(other.getAttribute("data-selected")).toBeNull();
    expect(other.getAttribute("aria-pressed")).toBe("false");
    expect(other.style.background).toBe("transparent");
  });

  it("selected state beats the hover wash so the armed shape keeps the accent wash", () => {
    const { container } = render(<ShapesPanel selectedEntryId="shape-square" />);
    const selected = container.querySelector('[data-shape-entry="shape-square"]') as HTMLElement;
    fireEvent.pointerEnter(selected);
    expect(selected.style.background).toBe(cssVar("color.fill.accent"));
    expect(selected.style.background).not.toBe(cssVar("color.fill.hover"));
  });

  it("renders no selected state when selectedEntryId is null", () => {
    const { container } = render(<ShapesPanel selectedEntryId={null} />);
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
  });
});
