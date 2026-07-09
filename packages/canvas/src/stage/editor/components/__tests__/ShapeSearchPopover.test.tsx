import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapeSearchPopover } from "../ShapeSearchPopover";
import { SHAPE_SEARCH_ENTRIES } from "../../../../objects/catalog";

afterEach(() => {
  cleanup();
});

describe("ShapeSearchPopover geometry", () => {
  it("renders a dark popover at the enlarged 232px width", () => {
    const { container } = render(<ShapeSearchPopover />);
    const popover = container.querySelector("[data-shape-search-popover]") as HTMLElement;
    expect(popover).toBeTruthy();
    expect(popover.style.width).toBe("232px");
    expect(popover.style.background).toBe("#1D1D1D");
  });

  it("renders a 5-column icon grid", () => {
    const { container } = render(<ShapeSearchPopover />);
    const grid = container.querySelector("[data-shape-search-grid]") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(5, 1fr)");
  });

  it("renders one entry button per SHAPE_SEARCH_ENTRIES item by default", () => {
    const { container } = render(<ShapeSearchPopover />);
    const buttons = container.querySelectorAll("[data-shape-entry]");
    expect(buttons.length).toBe(SHAPE_SEARCH_ENTRIES.length);
  });
});

describe("ShapeSearchPopover search filtering", () => {
  it("filters entries as the user types, case-insensitively (labels + def keywords)", () => {
    const { container } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "database" } });
    // P4 catalog unification: search matches the def-declared keywords too —
    // "database" hits Database (label) AND Cylinder (horizontal), whose def
    // keywords include "database".
    const labels = [...container.querySelectorAll("[data-shape-entry]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Database", "Cylinder (horizontal)"]);
  });

  it("matches def-declared catalog keywords that appear in no label", () => {
    const { container } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "subroutine" } });
    const labels = [...container.querySelectorAll("[data-shape-entry]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Predefined process"]);
  });

  it("shows a no-results message when nothing matches", () => {
    const { container, getByText } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-nonexistent" } });
    expect(getByText("No shapes found")).toBeTruthy();
  });
});

describe("ShapeSearchPopover interaction", () => {
  it("fires onPick with the entry's objectType when an entry is clicked", () => {
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapeSearchPopover onPick={onPick} />);
    const entry = SHAPE_SEARCH_ENTRIES[0];
    fireEvent.click(container.querySelector(`[data-shape-entry="${entry.id}"]`)!);
    expect(onPick).toHaveBeenCalledWith(entry.objectType);
  });
});
