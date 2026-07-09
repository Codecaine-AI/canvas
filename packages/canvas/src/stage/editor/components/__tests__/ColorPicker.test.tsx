import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ColorPicker } from "../ColorPicker";
import { EDITOR_STYLE } from "../editor-style";
import { resolveSwatchPreview } from "../../../../theme/palette";
import { CANVAS_COLORS } from "../../../../state/schema";

afterEach(() => {
  cleanup();
});

const SWATCH_INSET = "inset 0 0 0 1px rgba(255,255,255,0.14)";
const NEAR_WHITE_SWATCH_INSET = "inset 0 0 0 1px rgba(255,255,255,0.3)";

function needsContrastRing(hex: string): boolean {
  return /^#F/i.test(hex);
}

/**
 * P1/D12 — THE one color picker: a closed 10-pick row, identical
 * swatch-preview hexes for every kind, a FigJam current-color ring,
 * and no custom color affordance of any kind.
 */
describe("ColorPicker (the FigJam-style 10-pick row, D12)", () => {
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

  it("previews every swatch with its own swatch hex and FigJam swatch metrics", () => {
    const { container } = render(<ColorPicker current="blue" />);
    for (const color of CANVAS_COLORS) {
      const swatch = container.querySelector(`[data-canvas-color="${color}"]`) as HTMLElement;
      const previewHex = resolveSwatchPreview(color);
      expect(swatch.style.backgroundColor).toBe(previewHex);
      expect(swatch.style.width).toBe(`${EDITOR_STYLE.colorPopoverSwatchPx}px`);
      expect(swatch.style.height).toBe(`${EDITOR_STYLE.colorPopoverSwatchPx}px`);
      expect(swatch.style.boxShadow).toBe(
        needsContrastRing(previewHex) ? NEAR_WHITE_SWATCH_INSET : SWATCH_INSET,
      );
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
    const currentSwatch = container.querySelector('[data-canvas-color="blue"]') as HTMLElement;
    const currentRing = currentSwatch.querySelector("[data-current-ring]") as HTMLElement | null;
    expect(currentRing).not.toBeNull();
    expect(currentRing!.style.border).toBe(`2px solid ${EDITOR_STYLE.accentPurple}`);
    expect(currentRing!.style.borderRadius).toBe("9px");
    expect(currentRing!.style.pointerEvents).toBe("none");

    for (const color of CANVAS_COLORS.filter((color) => color !== "blue")) {
      const swatch = container.querySelector(`[data-canvas-color="${color}"]`)!;
      expect(swatch.querySelector("[data-current-ring]")).toBeNull();
    }

    fireEvent.click(container.querySelector('[data-canvas-color="pink"]')!);
    expect(picks).toEqual(["pink"]);
  });

  it("offers no custom-color affordance — every button is a roster swatch", () => {
    const { container } = render(<ColorPicker current="gray" />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(10);
    expect(Array.from(buttons).map((button) => button.getAttribute("data-canvas-color"))).toEqual([
      ...CANVAS_COLORS,
    ]);
  });
});
