import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ColorPalettePopover } from "../ColorPalettePopover";

afterEach(() => {
  cleanup();
});

describe("ColorPalettePopover geometry", () => {
  it("renders a dark panel with the shared 16px flyout radius", () => {
    const { container } = render(<ColorPalettePopover currentColor="#F24822" />);
    const panel = container.querySelector("[data-color-palette-popover]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.background).toBe("#1D1D1D");
    expect(parseFloat(panel.style.borderRadius)).toBe(16);
  });

  it("renders exactly 2 rows of 11 swatches each (22 total)", () => {
    const { container } = render(<ColorPalettePopover currentColor="#F24822" />);
    const row1 = container.querySelectorAll('[data-swatch-row="1"] [data-swatch]');
    const row2 = container.querySelectorAll('[data-swatch-row="2"] [data-swatch]');
    expect(row1.length).toBe(11);
    expect(row2.length).toBe(11);
    expect(container.querySelectorAll("[data-swatch]").length).toBe(22);
  });

  it("renders the final swatch as the current color with a rainbow-ring background", () => {
    const { container } = render(<ColorPalettePopover currentColor="#EB7500" />);
    const row2Swatches = container.querySelectorAll('[data-swatch-row="2"] [data-swatch]');
    const lastSwatch = row2Swatches[row2Swatches.length - 1] as HTMLElement;
    expect(lastSwatch.getAttribute("data-color")).toBe("#EB7500");
    expect(lastSwatch.style.background).toContain("conic-gradient");
    expect(lastSwatch.getAttribute("aria-label")).toBe("Current color #EB7500");
  });
});

describe("ColorPalettePopover interaction", () => {
  it("fires onPick with the clicked swatch's color", () => {
    const onPick = mock((_color: string) => {});
    const { container } = render(<ColorPalettePopover currentColor="#F24822" onPick={onPick} />);
    const swatches = container.querySelectorAll("[data-swatch]");
    const target = swatches[3] as HTMLElement; // some mid-row-1 swatch
    fireEvent.click(target);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBe(target.getAttribute("data-color"));
  });

  it("fires onPick with the current color when the rainbow-ring swatch is clicked", () => {
    const onPick = mock((_color: string) => {});
    const { container } = render(<ColorPalettePopover currentColor="#9747FF" onPick={onPick} />);
    const row2Swatches = container.querySelectorAll('[data-swatch-row="2"] [data-swatch]');
    fireEvent.click(row2Swatches[row2Swatches.length - 1]);
    expect(onPick).toHaveBeenCalledWith("#9747FF");
  });
});
