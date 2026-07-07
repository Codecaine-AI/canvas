import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapesPanel, SHAPES_PANEL_WIDTH_PX } from "../ShapesPanel";
import { SHAPE_CATALOG, type ShapeCatalogEntry } from "../../../objects/catalog/shape-catalog";

afterEach(() => {
  cleanup();
});

describe("ShapesPanel geometry", () => {
  it("renders a full-height white panel at the measured ~197px width", () => {
    const { container } = render(<ShapesPanel />);
    const panel = container.querySelector("[data-shapes-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.width).toBe(`${SHAPES_PANEL_WIDTH_PX}px`);
    expect(panel.style.height).toBe("100%");
    expect(panel.style.background).toBe("#FFFFFF");
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

  it("renders the correct entry count for each section (Basic=14, Flowchart=16, Advanced=26)", () => {
    const { container } = render(<ShapesPanel />);
    for (const category of SHAPE_CATALOG) {
      const grid = container.querySelector(`[data-shape-grid="${category.id}"]`) as HTMLElement;
      expect(grid.querySelectorAll("[data-shape-entry]").length).toBe(category.entries.length);
    }
    const basic = SHAPE_CATALOG.find((c) => c.id === "basic")!;
    const flowchart = SHAPE_CATALOG.find((c) => c.id === "flowchart")!;
    const advanced = SHAPE_CATALOG.find((c) => c.id === "advanced")!;
    expect(basic.entries.length).toBe(14);
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
});
