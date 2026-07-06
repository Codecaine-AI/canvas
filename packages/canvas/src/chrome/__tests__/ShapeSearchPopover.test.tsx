import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapeSearchPopover } from "../ShapeSearchPopover";
import { SHAPE_SEARCH_ENTRIES } from "../shape-catalog";

afterEach(() => {
  cleanup();
});

describe("ShapeSearchPopover geometry", () => {
  it("renders a dark popover matching the measured ~161px width", () => {
    const { container } = render(<ShapeSearchPopover />);
    const popover = container.querySelector("[data-shape-search-popover]") as HTMLElement;
    expect(popover).toBeTruthy();
    expect(popover.style.width).toBe("161px");
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
  it("filters entries as the user types, case-insensitively", () => {
    const { container } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cpu" } });
    const buttons = container.querySelectorAll("[data-shape-entry]");
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute("aria-label")?.toLowerCase()).toContain("cpu");
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
