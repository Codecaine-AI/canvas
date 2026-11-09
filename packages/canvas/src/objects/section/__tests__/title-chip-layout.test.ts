import { describe, expect, it } from "bun:test";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../../theme/canvas-style";
import type { InteractiveCanvasObject } from "../../../state/schema";
import { measureWidth } from "../../../theme/text-measure";
import { sectionTitleChipWorldRect } from "../title-chip-geometry";
import {
  estimateTitleChipWidthPx,
  titleChipHasContent,
  titleChipLayout,
  titleChipScale,
  titleChipVisibleTitle,
} from "../title-chip-layout";

/**
 * The section header chip layout (contract §4): floating vs pinned geometry,
 * `[icon] TITLE` content widths, and the ellipsis the static renderer
 * mirrors. A section's stored `detail` (the fixture carries one, as older
 * boards do) never paints. Expected numbers are worked from the spec (IBM
 * Plex Mono = 0.6em per glyph, 0.08em tracking on uppercase mono titles, 16px
 * icon + 6px gap, 6px icon lead / 10px text padding, 27px chip);
 * every run width is in Chromium's 1/64px layout units, rounded up, as
 * text-measure reports it.
 */

const LIGHT = canvasThemePreset("schematic-light");

function section(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "bun",
    type: "section",
    text: "Bun services",
    color: "teal",
    geometry: { x: 100, y: 80, width: 480, height: 360 },
    style: { shape: "section" },
    icon: "brand-bun",
    detail: "127.0.0.1",
    ...overrides,
  } as InteractiveCanvasObject;
}

/** `px` rounded up to Chromium's 1/64px layout unit. */
const layoutUnits = (px: number) => Math.ceil(px * 64 - 1e-6) / 64;
// "BUN SERVICES": 12 glyphs × (0.6 + 0.08)em × 14px.
const TITLE_WIDTH = layoutUnits(12 * 0.68 * 14);
/** The schematic title font: IBM Plex Mono 600 at 14px with 0.08em (1.12px) tracking. */
const MONO_TITLE = { family: "IBM Plex Mono", size: 14, weight: 600, letterSpacing: 0.08 * 14 };
const ELLIPSIS_WIDTH = layoutUnits(0.68 * 14);

describe("pinned title chip (schematic)", () => {
  it("sits right inside the 1.5px frame: 25.5px box, right + bottom edges only, frame-following top-left corner", () => {
    const layout = titleChipLayout(section(), LIGHT);
    expect(layout.placement).toBe("pinned");
    expect(layout.box.x).toBe(1.5);
    expect(layout.box.y).toBe(1.5);
    expect(layout.box.height).toBe(25.5);
    expect(layout.border).toEqual({ top: 0, right: 1.5, bottom: 1.5, left: 0 });
    // Inner frame corner (2px radius − 1.5px frame), the chip radius bottom-right.
    expect(layout.radius).toEqual({ topLeft: 0.5, topRight: 0, bottomRight: 2, bottomLeft: 0 });
    // Content centers in the band between the frame line and the bottom edge.
    expect(layout.box.y + layout.centerY).toBe(13.5);
  });

  it("lays out [icon] TITLE: 6px icon lead, 16px tile + 6px gap, and no stored detail", () => {
    const layout = titleChipLayout(section(), LIGHT);
    expect(layout.icon).toEqual({ id: "brand-bun", x: 6 });
    expect(layout.title.text).toBe("BUN SERVICES");
    expect(layout.title.x).toBe(28);
    expect(layout.title.widthPx).toBe(TITLE_WIDTH);
    expect(layout.title.widthPx).toBe(measureWidth("BUN SERVICES", MONO_TITLE));
    // Box = lead 6 + icon 22 + title + 10 padding + 1.5 right edge: the stored detail adds nothing.
    expect(layout.box.width).toBeCloseTo(6 + 22 + TITLE_WIDTH + 10 + 1.5, 9);
    expect(layout.box.width).toBe(titleChipLayout(section({ detail: undefined }), LIGHT).box.width);
    expect(estimateTitleChipWidthPx("Bun services", LIGHT, section())).toBeCloseTo(layout.box.width, 9);
  });

  it("its world rect starts at the section origin and stays anchored to the frame's inner corner when zoomed out", () => {
    // 600px wide so the zoomed-out chip (scale ≈ 2.3) still fits uncapped: (600 − 6) / 2.3 > its natural width.
    const wide = section({ geometry: { x: 100, y: 80, width: 600, height: 360 } });
    const width = 1.5 + titleChipLayout(wide, LIGHT).box.width;
    expect(sectionTitleChipWorldRect(wide, 1, LIGHT)).toEqual({ x: 100, y: 80, width, height: 27 });
    const scale = titleChipScale(0.25);
    const zoomed = sectionTitleChipWorldRect(wide, 0.25, LIGHT);
    expect(zoomed.x).toBe(100);
    expect(zoomed.y).toBe(80);
    expect(zoomed.height).toBeCloseTo(1.5 + 25.5 * scale, 9);
    expect(zoomed.width).toBeCloseTo(1.5 + (width - 1.5) * scale, 9);
  });

  it("flush in a borderless section's corner, and inside a thicker per-section frame", () => {
    const borderless = titleChipLayout(section({ style: { shape: "section", strokeStyle: "none" } }), LIGHT);
    expect(borderless.box).toMatchObject({ x: 0, y: 0, height: 27 });
    expect(borderless.radius.topLeft).toBe(2);
    const thick = titleChipLayout(section({ style: { shape: "section", strokeWidth: 3 } }), LIGHT);
    expect(thick.box).toMatchObject({ x: 3, y: 3, height: 24 });
    expect(thick.radius.topLeft).toBe(0);
  });

  it("drops an icon the registry does not know", () => {
    const bare = titleChipLayout(section({ icon: "nope" as never }), LIGHT);
    expect(bare.icon).toBeNull();
    expect(bare.paddingLeftPx).toBe(10);
  });
});

describe("chip ellipsis (what the static renderer draws)", () => {
  it("cuts the title character by character", () => {
    // Capped at 114: the title gets 114 − 10 − 1.5 − 28 = 74.5px — six
    // tracked cells and the ellipsis cell.
    const layout = titleChipLayout(section({ geometry: { x: 100, y: 80, width: 120, height: 200 } }), LIGHT);
    const keep = 6;
    expect(layoutUnits((keep + 1) * 0.68 * 14)).toBeLessThanOrEqual(74.5);
    expect(layoutUnits((keep + 2) * 0.68 * 14)).toBeGreaterThan(74.5);
    expect(titleChipVisibleTitle(layout)).toBe(`${"BUN SERVICES".slice(0, keep)}…`);
  });

  it("shows the whole title where a stored detail used to be cut first", () => {
    // 200 wide: the runs get 154.5px, room for the title alone.
    const layout = titleChipLayout(section({ geometry: { x: 100, y: 80, width: 200, height: 200 } }), LIGHT);
    expect(layout.truncated).toBe(false);
    expect(titleChipVisibleTitle(layout)).toBe("BUN SERVICES");
  });
});

describe("floating title chip (figjam)", () => {
  it("keeps the original inset chip and measures a plain title on real Inter Bold advances", () => {
    const plain = section({ icon: undefined, detail: undefined });
    const layout = titleChipLayout(plain, FIGJAM_CANVAS_STYLE);
    const title = measureWidth("Bun services", { family: "Inter", size: 16, weight: 700 });
    expect(layout.placement).toBe("floating");
    // The old 0.62em-per-character estimate (119.04px) sized it ~19px wider than it paints.
    expect(title).toBeLessThan(12 * 16 * 0.62 - 15);
    expect(layout.box).toEqual({ x: 3, y: 3, width: title + 10 * 2 + 1.5 * 2, height: 27 });
    expect(layout.border).toEqual({ top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 });
    expect(layout.title).toMatchObject({ text: "Bun services", x: 11.5 });
    expect(estimateTitleChipWidthPx("Bun services", FIGJAM_CANVAS_STYLE)).toBe(layout.box.width);
  });

  it("adds a 16px glyph before the title in the header font", () => {
    const layout = titleChipLayout(section(), FIGJAM_CANVAS_STYLE);
    expect(layout.icon).toEqual({ id: "brand-bun", x: 1.5 + 6 });
    expect(layout.title.x).toBe(1.5 + 6 + 22);
    expect(layout.title.font).toMatchObject({ font: "sans", fontSizePx: 16, fontWeight: 700, uppercase: false });
  });
});

describe("one measured layout for every consumer (paint, hits, text-fit)", () => {
  const bold = (text: string) => measureWidth(text, { family: "Inter", size: 16, weight: 700 });

  it("measures a figjam chip's Inter runs on real advances, with no char-count floor", () => {
    const cli = section({ text: "CLI", icon: undefined, detail: "cli.ts", geometry: { x: 0, y: 0, width: 100, height: 300 } });
    const layout = titleChipLayout(cli, FIGJAM_CANVAS_STYLE);
    const natural = 1.5 + 10 + bold("CLI") + 10 + 1.5;
    expect(layout.naturalWidthPx).toBeCloseTo(natural, 9);
    expect(layout.title.widthPx).toBeCloseTo(bold("CLI"), 9);
    // It fits its 94px budget — nothing is cut, and the hit rect is the painted chip.
    expect(layout.truncated).toBe(false);
    expect(titleChipVisibleTitle(layout)).toBe("CLI");
    expect(sectionTitleChipWorldRect(cli, 1, FIGJAM_CANVAS_STYLE).width).toBeCloseTo(natural, 9);
    expect(estimateTitleChipWidthPx("CLI", FIGJAM_CANVAS_STYLE, cli)).toBeCloseTo(natural, 9);
    // A short icon chip is narrower than the old 72px sans floor, as the live chip paints it.
    const iconOnly = titleChipLayout(section({ text: "CLI", icon: "terminal", detail: undefined }), FIGJAM_CANVAS_STYLE);
    expect(iconOnly.naturalWidthPx).toBeCloseTo(1.5 + 6 + 22 + bold("CLI") + 10 + 1.5, 9);
    expect(iconOnly.naturalWidthPx).toBeLessThan(72);
  });
});

describe("chip ellipsis never forces a character it has no room for", () => {
  it("draws nothing when the run cannot hold even the ellipsis (live overflow: hidden)", () => {
    // Zoom 0.05 → scale 6: a 120px section caps the chip at (120 − 6) / 6 = 19px,
    // less than the icon lead alone — the live chip shows its fill and nothing else.
    const layout = titleChipLayout(section({ text: "Servers", icon: "server", geometry: { x: 0, y: 0, width: 120, height: 300 } }), LIGHT, 0.05);
    expect(layout.box.width).toBeCloseTo(19, 9);
    expect(titleChipVisibleTitle(layout)).toBe("");
    const plain = titleChipLayout(section({ text: "Servers", icon: undefined, detail: undefined, geometry: { x: 0, y: 0, width: 120, height: 300 } }), FIGJAM_CANVAS_STYLE, 0.05);
    expect(titleChipVisibleTitle(plain)).toBe("");
  });

  it("keeps the bare ellipsis when it fits but no character does", () => {
    // Mono: the run gets 13.8px — room for the ~9.53px ellipsis cell, not for a cell plus it.
    const layout = titleChipLayout(section({ icon: undefined, detail: undefined, geometry: { x: 0, y: 0, width: 6 + 10 + 13.8 + 10 + 1.5, height: 300 } }), LIGHT);
    expect(layout.box.width - 10 - 1.5 - layout.title.x).toBeCloseTo(13.8, 9);
    expect(titleChipVisibleTitle(layout)).toBe("…");
  });
});

describe("a title's trailing space", () => {
  it("hangs at the line end and adds no width", () => {
    const alone = titleChipLayout(section({ text: "A ", icon: undefined }), FIGJAM_CANVAS_STYLE);
    expect(alone.naturalWidthPx).toBe(titleChipLayout(section({ text: "A", icon: undefined }), FIGJAM_CANVAS_STYLE).naturalWidthPx);
  });
});

describe("titleChipHasContent", () => {
  it("is true for a title or a known icon, never for a stored detail alone", () => {
    expect(titleChipHasContent(section({ icon: undefined, detail: undefined }))).toBe(true);
    expect(titleChipHasContent(section({ text: "", icon: "server", detail: undefined }))).toBe(true);
    expect(titleChipHasContent(section({ text: "", icon: undefined, detail: "port 80" }))).toBe(false);
    expect(titleChipHasContent(section({ text: "", icon: "nope" as never }))).toBe(false);
  });
});
