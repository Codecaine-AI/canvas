import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ColorPicker } from "../ColorPicker";
import { resolveSwatchPreview } from "../../../palette";
import { CANVAS_COLORS } from "../../../state/schema";

afterEach(() => {
  cleanup();
});

/**
 * P1/D12 — THE one color picker: a closed 10-pick row, identical
 * swatch-preview hexes for every kind, a current-color ring,
 * and no custom color affordance of any kind.
 */
describe("ColorPicker (the one 10-pick row, D12)", () => {
  it("renders exactly the 10 roster swatches in picker order", () => {
    const { container } = render(<ColorPicker current="gray" />);
    const swatches = Array.from(container.querySelectorAll("[data-canvas-color]"));
    expect(swatches.map((swatch) => swatch.getAttribute("data-canvas-color"))).toEqual([
      ...CANVAS_COLORS,
    ]);
    const rows = container.querySelectorAll("[data-swatch-row]");
    expect(rows.length).toBe(1);
    expect(rows[0]!.querySelectorAll("[data-canvas-color]").length).toBe(CANVAS_COLORS.length);
  });

  it("previews every swatch with its own swatch hex (identical for every kind)", () => {
    const { container } = render(<ColorPicker />);
    for (const color of ["red", "yellow", "teal", "white"] as const) {
      const swatch = container.querySelector(`[data-canvas-color="${color}"]`) as HTMLElement;
      expect(swatch.style.backgroundColor).toBe(resolveSwatchPreview(color));
    }
  });

  it("marks only the current pick with the ring and reports picks by id", () => {
    const picks: string[] = [];
    const { container } = render(
      <ColorPicker current="blue" onPick={(color) => picks.push(color)} />,
    );
    expect(
      Array.from(container.querySelectorAll('[data-current="true"]')).map((swatch) =>
        swatch.getAttribute("data-canvas-color"),
      ),
    ).toEqual(["blue"]);
    fireEvent.click(container.querySelector('[data-canvas-color="pink"]')!);
    expect(picks).toEqual(["pink"]);
  });

  it("offers no custom-color affordance — every button is a roster swatch", () => {
    const { container } = render(<ColorPicker current="gray" />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(10);
    for (const button of Array.from(buttons)) {
      expect(button.getAttribute("data-canvas-color")).toBeTruthy();
    }
  });
});
