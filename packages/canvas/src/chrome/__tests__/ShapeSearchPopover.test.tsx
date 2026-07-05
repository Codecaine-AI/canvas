import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapeSearchPopover } from "../ShapeSearchPopover";
import { isShapeEntryEnabled, SHAPE_SEARCH_ENTRIES } from "../shape-catalog";

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
    fireEvent.change(input, { target: { value: "chip" } });
    const buttons = container.querySelectorAll("[data-shape-entry]");
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute("aria-label")).toContain("Chip");
  });

  it("shows a no-results message when nothing matches", () => {
    const { container, getByText } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-nonexistent" } });
    expect(getByText("No shapes found")).toBeTruthy();
  });
});

describe("ShapeSearchPopover disabled ('coming soon') entries", () => {
  it("disables entries whose objectType isn't yet in the schema vocabulary", () => {
    const { container } = render(<ShapeSearchPopover />);
    const disabledSearchEntries = SHAPE_SEARCH_ENTRIES.filter((e) => !isShapeEntryEnabled(e));
    for (const entry of disabledSearchEntries) {
      const btn = container.querySelector(`[data-shape-entry="${entry.id}"]`) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("aria-label")).toContain("coming soon");
    }
  });
});

describe("ShapeSearchPopover interaction", () => {
  it("fires onPick with the entry's objectType when an enabled entry is clicked", () => {
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapeSearchPopover onPick={onPick} />);
    const enabledEntry = SHAPE_SEARCH_ENTRIES.find((e) => isShapeEntryEnabled(e));
    expect(enabledEntry).toBeTruthy();
    fireEvent.click(container.querySelector(`[data-shape-entry="${enabledEntry!.id}"]`)!);
    expect(onPick).toHaveBeenCalledWith(enabledEntry!.objectType);
  });

  it("does not fire onPick when a disabled entry is clicked", () => {
    const onPick = mock((_type: string) => {});
    const { container } = render(<ShapeSearchPopover onPick={onPick} />);
    const disabledEntry = SHAPE_SEARCH_ENTRIES.find((e) => !isShapeEntryEnabled(e));
    if (disabledEntry) {
      fireEvent.click(container.querySelector(`[data-shape-entry="${disabledEntry.id}"]`)!);
      expect(onPick).not.toHaveBeenCalled();
    }
  });
});
