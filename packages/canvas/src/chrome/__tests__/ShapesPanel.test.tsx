import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapesPanel, SHAPES_PANEL_WIDTH_PX } from "../ShapesPanel";
import { isShapeEntryEnabled, SHAPE_CATALOG } from "../shape-catalog";

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
  it("renders all 5 catalog category sections", () => {
    const { container } = render(<ShapesPanel />);
    const categories = container.querySelectorAll("[data-shape-category]");
    expect(categories.length).toBe(5);
    expect(Array.from(categories).map((c) => c.getAttribute("data-shape-category"))).toEqual([
      "recents",
      "connections",
      "basic",
      "flowchart",
      "advanced",
    ]);
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

  it("renders the correct entry count for each section", () => {
    const { container } = render(<ShapesPanel />);
    for (const category of SHAPE_CATALOG) {
      const grid = container.querySelector(`[data-shape-grid="${category.id}"]`) as HTMLElement;
      expect(grid.querySelectorAll("[data-shape-entry]").length).toBe(category.entries.length);
    }
  });
});

describe("ShapesPanel 'Other libraries' footer", () => {
  it("renders the AWS/Azure/Cisco rows as static/disabled", () => {
    const { container } = render(<ShapesPanel />);
    const aws = container.querySelector('[data-other-library="aws"]') as HTMLElement;
    expect(aws.textContent).toContain("AWS");
    expect(aws.textContent).toContain("805 shapes");
    expect(aws.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("ShapesPanel search", () => {
  it("filters categories/entries by query and hides empty categories", () => {
    const { getByLabelText, container } = render(<ShapesPanel />);
    fireEvent.change(getByLabelText("Search shapes"), { target: { value: "hexagon" } });
    const categories = container.querySelectorAll("[data-shape-category]");
    // "Hexagon" only appears in Basic per the catalog data.
    expect(categories.length).toBe(1);
    expect(categories[0].getAttribute("data-shape-category")).toBe("basic");
  });
});

describe("ShapesPanel interaction", () => {
  it("fires onPick with the objectType of an enabled clicked entry", () => {
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapesPanel onPick={onPick} />);
    const enabledEntry = SHAPE_CATALOG.flatMap((c) => c.entries).find((e) => isShapeEntryEnabled(e));
    expect(enabledEntry).toBeTruthy();
    fireEvent.click(container.querySelector(`[data-shape-entry="${enabledEntry!.id}"]`)!);
    expect(onPick).toHaveBeenCalledWith(enabledEntry!.objectType);
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = mock(() => {});
    const { getByLabelText } = render(<ShapesPanel onClose={onClose} />);
    fireEvent.click(getByLabelText("Close shapes panel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
