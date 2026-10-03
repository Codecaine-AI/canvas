import { describe, expect, it } from "bun:test";
import { ellipsizeDetailText, measureDetailTextPx, renderDocumentToSvg } from "../static-svg";
import { measureWidth } from "../../theme/text-measure";

/** The schematic detail font: IBM Plex Mono 500 at 14px. */
const monoWidth = (text: string) => measureWidth(text, { family: "IBM Plex Mono", size: 14, weight: 500 });
import { canvasThemePreset, DEFAULT_CANVAS_STYLE, FIGJAM_CANVAS_STYLE, type CanvasThemeId } from "../../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK_SVG } from "../../theme/fonts";
import { resolveIconPaint, resolveIconTilePaint, resolveShapePaint } from "../../theme/palette";
import { mixColors } from "../../theme/color-math";
import { CENTER_TEXT_INSET_PX, detailTypography } from "../../objects/text-slots";
import { resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { ICON_TILE, iconTileGlyphStrokeWidth, iconTileLayout } from "../../objects/shapes/icon/icon-tile";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

/**
 * The static renderer's shape / icon / text parts under the theme model:
 * card vs tint shape paint, the detail line (center slots and the below band),
 * icon tiles vs bare glyphs, fill-paint brand glyphs, and the icon pack.
 */

/** The schematic name line box: textFontSizePx × 1.2 (21px at 17.5px). */
const NAME_LINE_PX = canvasThemePreset("schematic-light").textFontSizePx * 1.2;

function documentOf(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return { schemaVersion: 1, id: "detail-fixture", mode: "diagram", objects, connections: [] };
}

function render(objects: InteractiveCanvasObject[], theme: CanvasThemeId = "figjam") {
  return renderDocumentToSvg(documentOf(objects), {
    canvasStyle: canvasThemePreset(theme),
    background: "transparent",
    padding: 0,
  }).svg;
}

function shape(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "s1",
    type: "process",
    text: "Run Executor LLM",
    parentId: null,
    geometry: { x: 0, y: 0, width: 240, height: 80 },
    style: { shape: "rounded-rect" },
    color: "blue",
    ...partial,
  } as InteractiveCanvasObject;
}

function icon(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "i1",
    type: "icon",
    icon: "database",
    text: "Orders DB",
    parentId: null,
    geometry: { x: 0, y: 0, width: 64, height: 64 },
    style: { shape: "icon" },
    color: "violet",
    ...partial,
  } as InteractiveCanvasObject;
}

/** Every `<text …>…</text>` element, with its attributes parsed. */
function texts(svg: string): Array<{ attrs: Record<string, string>; body: string }> {
  return [...svg.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)].map((match) => ({
    attrs: Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!])),
    body: match[2]!,
  }));
}

function tspanYs(body: string): number[] {
  return [...body.matchAll(/<tspan [^>]*y="([^"]*)"/g)].map((match) => Number(match[1]));
}

describe("static shapes: card vs tint paint", () => {
  it("figjam keeps the pastel tint fill with the ink border and black bold names", () => {
    const svg = render([shape()]);
    const paint = resolveShapePaint("blue", FIGJAM_CANVAS_STYLE);
    expect(svg).toContain(`fill="${paint.fill}" stroke="${paint.border}" stroke-width="2"`);
    expect(paint.fill).toBe("#CDDFFF");
    const [name] = texts(svg);
    expect(name!.attrs.fill).toBe("#000000");
    expect(name!.attrs["font-weight"]).toBe("700");
  });

  it("schematic shapes are cards: card fill, ink border at the theme's width, the style's name color and weight", () => {
    for (const theme of ["schematic-light", "schematic-dark"] as const) {
      const style = canvasThemePreset(theme);
      const svg = render([shape(), shape({ id: "d1", type: "decision", style: { shape: "diamond" }, geometry: { x: 300, y: 0, width: 200, height: 140 } })], theme);
      expect(svg).toContain(`fill="${style.cardFill}" stroke="${style.palette.blue}" stroke-width="2"`);
      // The diamond polygon too.
      expect(svg).toMatch(new RegExp(`<polygon [^>]*fill="${style.cardFill}" stroke="${style.palette.blue}"`));
      const [name] = texts(svg);
      expect(name!.attrs.fill).toBe(style.textColor);
      expect(name!.attrs["font-weight"]).toBe("600");
    }
  });
});

describe("static detail line — center slots", () => {
  it("paints the detail as its own muted mono <text> under the name, the pair centered as one block", () => {
    const svg = render([shape({ detail: "Function Calling LLM" })], "schematic-light");
    const [name, detail] = texts(svg);
    expect(detail!.body).toBe("Function Calling LLM");
    expect(detail!.attrs).toMatchObject({
      fill: "#5B6578",
      "font-family": CANVAS_MONO_FONT_STACK_SVG,
      "font-size": "14",
      "font-weight": "500",
      "text-anchor": "middle",
      "dominant-baseline": "central",
      x: "120",
    });
    // Slot: y 12..68 (56px). Block = one name line + 3 + 18.2 (14px × 1.3), centered.
    const block = NAME_LINE_PX + 3 + 18.2;
    const top = CENTER_TEXT_INSET_PX.y + (56 - block) / 2;
    expect(tspanYs(name!.body)).toEqual([Math.round((top + NAME_LINE_PX / 2) * 100) / 100]);
    expect(Number(detail!.attrs.y)).toBeCloseTo(top + NAME_LINE_PX + 3 + 18.2 / 2, 2);
  });

  it("figjam paints a sans detail (the root font) in its own muted color", () => {
    const [, detail] = texts(render([shape({ detail: ":4820" })]));
    expect(detail!.attrs).toMatchObject({ fill: "#5C5C5C", "font-size": "13", "font-weight": "400" });
    expect(detail!.attrs["font-family"]).toBeUndefined();
  });

  it("collapses newlines and ellipsizes the detail at the slot width", () => {
    const [, collapsed] = texts(render([shape({ detail: "line one\nline two" })], "schematic-light"));
    expect(collapsed!.body).toBe("line one line two");

    const long = "s3://customer-data/normalized/2026/records.parquet";
    const [, cut] = texts(render([shape({ detail: long })], "schematic-light"));
    const slotWidth = 240 - CENTER_TEXT_INSET_PX.x * 2;
    expect(cut!.body.endsWith("…")).toBe(true);
    expect(long.startsWith(cut!.body.slice(0, -1))).toBe(true);
    expect(monoWidth(cut!.body)).toBeLessThanOrEqual(slotWidth);
    // One more character would not have fit.
    expect(monoWidth(`${long.slice(0, [...cut!.body].length)}…`)).toBeGreaterThan(slotWidth);
  });

  it("the name loses lines before the detail disappears; a box too short for both keeps only the name", () => {
    const name = "A name long enough to wrap onto three lines in this box";
    // 56px slot less the detail's 3 + 18.2px reserve leaves 34.8px: one 18px name line of the three.
    const [clamped, kept] = texts(render([shape({ text: name, detail: ":4820", geometry: { x: 0, y: 0, width: 180, height: 80 } })], "schematic-light"));
    expect(tspanYs(clamped!.body)).toHaveLength(1);
    expect(clamped!.body).toContain("…");
    expect(kept!.body).toBe(":4820");

    const short = render([shape({ detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 40 } })], "schematic-light");
    expect(texts(short)).toHaveLength(1);
    expect(short).not.toContain(":4820");
  });

  it("paints a detail alone (no gap) when the name is empty", () => {
    const [only] = texts(render([shape({ text: "", detail: "detail only" })], "schematic-light"));
    expect(only!.body).toBe("detail only");
    expect(Number(only!.attrs.y)).toBeCloseTo(40, 2);
  });

  it("a detail-only box too short for a name line plus the detail still paints the detail", () => {
    // 200×50 → a 26px slot: no room for 18 + 3 + 18.2, plenty for the 18.2px detail alone.
    const [only] = texts(render([shape({ text: "", detail: "port: 5432", geometry: { x: 0, y: 0, width: 200, height: 50 } })], "schematic-light"));
    expect(only?.body).toBe("port: 5432");
    expect(Number(only!.attrs.y)).toBeCloseTo(25, 2);
  });

  it("stickies never paint a detail", () => {
    const sticky = shape({ type: "sticky", style: { shape: "note" }, text: "Body", detail: "never", color: "yellow", geometry: { x: 0, y: 0, width: 240, height: 200 } });
    for (const theme of ["figjam", "schematic-light"] as const) {
      expect(render([sticky], theme)).not.toContain("never");
    }
  });

  it("a blank or absent detail renders byte-identically to no detail", () => {
    const plain = render([shape()]);
    expect(render([shape({ detail: "" })])).toBe(plain);
    expect(render([shape({ detail: "  \n " })])).toBe(plain);
    expect(renderDocumentToSvg(documentOf([shape()])).svg).toBe(
      renderDocumentToSvg(documentOf([shape()]), { canvasStyle: DEFAULT_CANVAS_STYLE }).svg,
    );
  });
});

describe("static detail line — the icon's below band", () => {
  it("paints the caption, then the detail line under its last line", () => {
    const svg = render([icon({ text: "Orders DB", detail: "postgres 16" })], "schematic-light");
    const [caption, detail] = texts(svg);
    const captionYs = tspanYs(caption!.body);
    // The band hangs 6px under the 56px tile centered in the 64px box (tile bottom 4 + 56 = 60).
    expect(captionYs).toEqual([60 + 6 + NAME_LINE_PX / 2]);
    expect(detail!.body).toBe("postgres 16");
    expect(Number(detail!.attrs.y)).toBeCloseTo(60 + 6 + NAME_LINE_PX + 3 + 18.2 / 2, 2);
    expect(detail!.attrs.x).toBe("32");
  });

  it("ellipsizes a detail past the band's max width", () => {
    const long = "a detail that runs well past the band and ellipsizes";
    const [, detail] = texts(render([icon({ detail: long })], "schematic-light"));
    expect(detail!.body.endsWith("…")).toBe(true);
    expect(monoWidth(detail!.body)).toBeLessThanOrEqual(200);
  });
});

describe("ellipsizeDetailText", () => {
  it("returns the text unchanged when it fits and cuts mono runs at whole cells", () => {
    const mono = detailTypography(canvasThemePreset("schematic-light"));
    expect(ellipsizeDetailText(":4820", 100, mono)).toBe(":4820");
    // 10 cells of 8.4px (0.6em × 14px): 9 characters + the ellipsis.
    expect(ellipsizeDetailText("abcdefghijklmnop", 84, mono)).toBe("abcdefghi…");
    expect(ellipsizeDetailText("abcd efgh", 5 * 8.4, mono)).toBe("abcd…");
    expect(ellipsizeDetailText("abcd  efgh", 6 * 8.4, mono)).toBe("abcd…");
  });

  it("measures sans runs with Inter's regular advances", () => {
    const sans = detailTypography(FIGJAM_CANVAS_STYLE);
    const text = "postgres 16 · db.t3.micro";
    const width = measureDetailTextPx(text, sans);
    expect(ellipsizeDetailText(text, width, sans)).toBe(text);
    const cut = ellipsizeDetailText(text, width - 1, sans);
    expect(cut.endsWith("…")).toBe(true);
    expect(measureDetailTextPx(cut, sans)).toBeLessThanOrEqual(width - 1);
  });
});

describe("static icons: tile vs glyph, packs, brands", () => {
  it("figjam draws the bare Nucleo glyph in the ink with the shape fill in its interiors", () => {
    const svg = render([icon({ icon: "model", color: "red" })]);
    const paint = resolveIconPaint("red", FIGJAM_CANVAS_STYLE);
    const glyph = resolveIconGlyph("model", "nucleo");
    expect(glyph.source).toBe("nucleo");
    expect(svg).toContain(`viewBox="0 0 18 18" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${paint.glyph}"`);
    expect(svg).toContain(`<g fill="${paint.glyphFill}" stroke="none">`);
    expect(svg).not.toContain("<rect");
  });

  it("schematic draws a rounded tile in the ink, capped at iconTileMaxPx and centered in the box, the Tabler glyph inset on it", () => {
    for (const theme of ["schematic-light", "schematic-dark"] as const) {
      const style = canvasThemePreset(theme);
      const svg = render([icon({ geometry: { x: 0, y: 0, width: 100, height: 64 } })], theme);
      const paint = resolveIconPaint("violet", style);
      const layout = iconTileLayout(100, 64, style.iconTileMaxPx);
      // min(100, 64, 56) = 56, centered both ways in the 100×64 box.
      expect(layout.tile).toEqual({ x: 22, y: 4, width: 56, height: 56 });
      expect(svg).toContain(
        `<rect x="22" y="4" width="56" height="56" rx="${ICON_TILE.cornerRadiusPx}" fill="${paint.tileFill}"/>`,
      );
      // The caption hangs 6px under the tile (tile bottom 60), centered on it.
      const [caption] = texts(svg);
      expect(tspanYs(caption!.body)).toEqual([60 + 6 + NAME_LINE_PX / 2]);
      expect(caption!.body).toContain('x="50"');
      const glyph = resolveIconGlyph("database", "tabler");
      expect(glyph.source).toBe("tabler");
      const inset = 56 * ICON_TILE.glyphInsetRatio;
      const strokeWidth = Math.round(iconTileGlyphStrokeWidth(24) * 100) / 100;
      expect(svg).toContain(
        `<svg x="${Math.round((22 + inset) * 100) / 100}" y="${Math.round((4 + inset) * 100) / 100}" width="${Math.round((56 - inset * 2) * 100) / 100}"`,
      );
      expect(svg).toContain(`viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${style.iconTileGlyphColor}" stroke-width="${strokeWidth}"`);
      for (const element of glyph.elements) {
        if (element.kind === "path") expect(svg).toContain(`d="${element.d}"`);
      }
    }
  });

  it("a white tile on a light board is outlined: card fill, 1px ink border inside the edge, ink glyph", () => {
    const style = canvasThemePreset("schematic-light");
    const svg = render([icon({ color: "white" })], "schematic-light");
    // The 56px tile centered in the 64px box (4..60), its 1px border inside the edge.
    expect(svg).toContain(
      `<rect x="4.5" y="4.5" width="55" height="55" rx="2.5" fill="${style.cardFill}" stroke="${style.palette.white}" stroke-width="1"/>`,
    );
    expect(svg).toContain(`stroke="${style.palette.white}" stroke-width=`);
    // Dark boards keep a solid white-ink tile.
    const dark = canvasThemePreset("schematic-dark");
    expect(render([icon({ color: "white" })], "schematic-dark")).toContain(`fill="${dark.palette.white}"/>`);
  });

  it("fills fill-paint brand glyphs: with the tile glyph color on a tile, with the ink when bare", () => {
    const brand = resolveIconGlyph("brand-docker", "tabler");
    expect(brand.paint).toBe("fill");
    const tiled = render([icon({ icon: "brand-docker" })], "schematic-light");
    expect(tiled).toContain(`viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="#FFFFFF" stroke="none"`);
    const bare = render([icon({ icon: "brand-docker" })]);
    const ink = resolveIconPaint("violet", FIGJAM_CANVAS_STYLE).glyph;
    expect(bare).toContain(`fill="${ink}" stroke="none"`);
    expect(bare).not.toContain(`<g fill=`);
  });

  it("the icon pack swaps a generic glyph's geometry", () => {
    const nucleo = resolveIconGlyph("agent", "nucleo");
    const tabler = resolveIconGlyph("agent", "tabler");
    const style = { ...canvasThemePreset("figjam"), iconPack: "tabler" as const };
    const svg = renderDocumentToSvg(documentOf([icon({ icon: "agent" })]), { canvasStyle: style }).svg;
    const firstPath = (glyph: typeof nucleo) => glyph.elements.find((element) => element.kind === "path") as { d: string };
    expect(svg).toContain(`d="${firstPath(tabler).d}"`);
    expect(svg).not.toContain(`d="${firstPath(nucleo).d}"`);
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it("auto tile fill: a tile past iconTileSolidMaxPx is tinted, with an ink border and an ink glyph capped at 56px", () => {
    // Lift the 56px tile cap so a 170px box draws a 170px tile (the size rule's subject).
    const style = { ...canvasThemePreset("schematic-light"), iconTileMaxPx: 240 };
    const renderAt = (size: number) =>
      renderDocumentToSvg(documentOf([icon({ geometry: { x: 0, y: 0, width: size, height: size } })]), {
        canvasStyle: style,
        background: "transparent",
        padding: 0,
      }).svg;
    const ink = style.palette.violet;
    expect(renderAt(72)).toContain(`fill="${ink}"/>`);
    const tinted = renderAt(170);
    const tint = resolveIconTilePaint("violet", style, 170);
    expect(tint.tileFill).toBe(mixColors(ink, style.cardFill, 0.16));
    expect(tinted).toContain(
      `<rect x="1" y="1" width="168" height="168" rx="2" fill="${tint.tileFill}" stroke="${ink}" stroke-width="2"/>`,
    );
    // The glyph viewport: 56px, centered on the 170px tile, stroked in the ink.
    expect(tinted).toContain(`<svg x="57" y="57" width="56" height="56" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${ink}"`);
    // Under the preset's 56px cap the same box draws a solid 56px tile, centered.
    expect(render([icon({ geometry: { x: 0, y: 0, width: 170, height: 170 } })], "schematic-light")).toContain(
      `<rect x="57" y="57" width="56" height="56" rx="${ICON_TILE.cornerRadiusPx}" fill="${ink}"/>`,
    );
  });

  it("iconTileFill overrides the size rule both ways", () => {
    // Uncapped tile (iconTileMaxPx 240) so the 170px box is past iconTileSolidMaxPx and would auto-tint.
    const style = { ...canvasThemePreset("schematic-light"), iconTileMaxPx: 240 };
    const big = icon({ geometry: { x: 0, y: 0, width: 170, height: 170 } });
    const small = icon();
    const solidSvg = renderDocumentToSvg(documentOf([big]), { canvasStyle: { ...style, iconTileFill: "solid" } }).svg;
    expect(solidSvg).toContain(`fill="${style.palette.violet}"/>`);
    const tintSvg = renderDocumentToSvg(documentOf([small]), { canvasStyle: { ...style, iconTileFill: "tint" } }).svg;
    expect(tintSvg).toContain(`stroke="${style.palette.violet}" stroke-width="2"/>`);
  });

  it("a crop that shows only a tile's rim draws the tile without the nested glyph viewport", () => {
    const document = documentOf([icon({ geometry: { x: 0, y: 0, width: 120, height: 120 } })]);
    const svg = renderDocumentToSvg(document, {
      canvasStyle: canvasThemePreset("schematic-light"),
      cropRect: { x: 0, y: 0, width: 20, height: 20 },
    }).svg;
    expect(svg).toContain("<rect");
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });
});
