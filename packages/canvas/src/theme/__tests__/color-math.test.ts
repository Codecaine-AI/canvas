import { describe, expect, it } from "bun:test";
import {
  contrastRatio,
  ensureContrast,
  mixColors,
  normalizeColor,
  oklabLightness,
  parseColor,
  withAlpha,
} from "../color-math";

describe("color tokens: parse + canonical spelling", () => {
  it("accepts #RRGGBB and rgba(), canonicalizing case and spacing", () => {
    expect(normalizeColor("#0f8a7a")).toBe("#0F8A7A");
    expect(normalizeColor(" rgba(15,30,54,0.13) ")).toBe("rgba(15, 30, 54, 0.13)");
    expect(normalizeColor("rgba(0, 0, 0, .25)")).toBe("rgba(0, 0, 0, 0.25)");
    // Fully opaque rgba() is the same color as its hex spelling.
    expect(normalizeColor("rgba(255, 255, 255, 1)")).toBe("#FFFFFF");
    expect(parseColor("rgba(15, 30, 54, 0.5)")).toEqual({ r: 15, g: 30, b: 54, a: 0.5 });
  });

  it.each([
    ["short hex", "#FFF"],
    ["8-digit hex", "#FFFFFF80"],
    ["rgb()", "rgb(0, 0, 0)"],
    ["channel out of range", "rgba(300, 0, 0, 1)"],
    ["alpha out of range", "rgba(0, 0, 0, 1.5)"],
    ["named color", "red"],
    ["number", 0xffffff],
  ])("rejects %s", (_name, value) => {
    expect(normalizeColor(value)).toBeNull();
  });
});

describe("mixColors / withAlpha", () => {
  it("is a per-channel sRGB mix weighted toward the first color, rounded to opaque hex", () => {
    expect(mixColors("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixColors("#0F8A7A", "#FFFFFF", 0.07)).toBe("#EEF7F6");
    expect(mixColors("#0F8A7A", "#FFFFFF", 0)).toBe("#FFFFFF");
    expect(mixColors("#0F8A7A", "#FFFFFF", 1)).toBe("#0F8A7A");
  });

  it("withAlpha multiplies alpha and stays hex when opaque", () => {
    expect(withAlpha("#0F8A7A", 0.5)).toBe("rgba(15, 138, 122, 0.5)");
    expect(withAlpha("#0F8A7A", 1)).toBe("#0F8A7A");
    expect(withAlpha("rgba(15, 138, 122, 0.5)", 0.5)).toBe("rgba(15, 138, 122, 0.25)");
  });
});

describe("lightness and contrast", () => {
  it("OKLab L spans black to white", () => {
    expect(oklabLightness("#000000")).toBeCloseTo(0, 6);
    expect(oklabLightness("#FFFFFF")).toBeCloseTo(1, 3);
    // The schematic-dark card surface (spec value ≈ 0.287).
    expect(oklabLightness("#252A38")).toBeCloseTo(0.287, 2);
  });

  it("WCAG contrast is 21:1 for black on white and 1:1 for a color on itself", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#5B6578", "#5B6578")).toBe(1);
  });

  it("ensureContrast leaves a passing color alone", () => {
    expect(ensureContrast("#5c5c5c", "#E6E6E6", 3)).toBe("#5C5C5C");
  });

  it("ensureContrast pushes the least amount toward `toward`, then toward the extreme", () => {
    const chip = "#DCDDE2";
    const pushed = ensureContrast("#B0B4BF", chip, 3, "#5B6578");
    expect(contrastRatio(pushed, chip)).toBeGreaterThanOrEqual(3);
    // A partial push, not a snap to the ink (the ink itself clears 3:1 easily).
    expect(contrastRatio(pushed, chip)).toBeLessThan(3.1);
    expect(contrastRatio("#5B6578", chip)).toBeGreaterThan(4);

    // `toward` itself is too weak: the push continues on to black.
    const deep = ensureContrast("#D0D0D0", "#E0E0E0", 7, "#C0C0C0");
    expect(contrastRatio(deep, "#E0E0E0")).toBeGreaterThanOrEqual(7);
  });
});
