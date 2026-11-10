import { describe, expect, it } from "bun:test";
import { renderDocumentToSvg } from "../static-svg";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE, type CanvasThemeId } from "../../theme/canvas-style";
import { resolveIconPaint, resolveIconTilePaint, resolveShapePaint } from "../../theme/palette";
import { mixColors } from "../../theme/color-math";
import { resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { ICON_TILE, iconTileGlyphStrokeWidth, iconTileLayout } from "../../objects/shapes/icon/icon-tile";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

/**
 * The static renderer's shape / icon / text parts under the theme model:
 * card vs tint shape paint, a stored detail that never paints, icon tiles vs
 * bare glyphs, fill-paint brand glyphs, and the icon pack.
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

  it("schematic shapes are cards: the theme's card paint, ink border at the theme's width, the style's name color and weight", () => {
    // schematic-light tints the card in the ink's hue (ink-card); schematic-dark keeps the plain card.
    for (const theme of ["schematic-light", "schematic-dark"] as const) {
      const style = canvasThemePreset(theme);
      const fill = resolveShapePaint("blue", style).fill;
      const svg = render([shape(), shape({ id: "d1", type: "decision", style: { shape: "diamond" }, geometry: { x: 300, y: 0, width: 200, height: 140 } })], theme);
      expect(svg).toContain(`fill="${fill}" stroke="${style.palette.blue}" stroke-width="2"`);
      // The diamond polygon too.
      expect(svg).toMatch(new RegExp(`<polygon [^>]*fill="${fill}" stroke="${style.palette.blue}"`));
      const [name] = texts(svg);
      expect(name!.attrs.fill).toBe(style.textColor);
      expect(name!.attrs["font-weight"]).toBe("600");
    }
  });
});

describe("a stored detail paints nothing: a node shows its name only", () => {
  it("a shape and an icon with a detail render byte-identically to the same nodes without one", () => {
    for (const theme of ["figjam", "schematic-light", "schematic-dark"] as const) {
      const stored = render([shape({ detail: "db.t3.micro:5432" }), icon({ id: "i1", geometry: { x: 400, y: 0, width: 64, height: 64 }, detail: "postgres 16" })], theme);
      const plain = render([shape(), icon({ id: "i1", geometry: { x: 400, y: 0, width: 64, height: 64 } })], theme);
      expect(stored).toBe(plain);
      expect(stored).not.toContain("db.t3.micro");
      expect(stored).not.toContain("postgres 16");
    }
  });

  it("the name keeps the whole slot, and a detail-only node paints no text at all", () => {
    const name = "A name long enough to wrap onto three lines in this box";
    const [clamped] = texts(render([shape({ text: name, detail: ":4820", geometry: { x: 0, y: 0, width: 180, height: 80 } })], "schematic-light"));
    // 56px slot ÷ 21px lines: two name lines, nothing reserved under them.
    expect(tspanYs(clamped!.body)).toHaveLength(Math.floor(56 / NAME_LINE_PX));
    expect(texts(render([shape({ text: "", detail: "detail only" })], "schematic-light"))).toHaveLength(0);
    expect(texts(render([icon({ text: "", detail: ":4820" })], "schematic-light"))).toHaveLength(0);
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

  it("schematic draws a rounded tile in the node paint, capped at iconTileMaxPx and centered in the box, the Tabler glyph inset on it", () => {
    for (const theme of ["schematic-light", "schematic-dark"] as const) {
      const style = canvasThemePreset(theme);
      const svg = render([icon({ geometry: { x: 0, y: 0, width: 100, height: 64 } })], theme);
      const shapePaint = resolveShapePaint("violet", style);
      const layout = iconTileLayout(100, 64, style.iconTileMaxPx);
      // min(100, 64, 56) = 56, centered both ways in the 100×64 box; the 2px ink edge (the node border
      // width since stage B round 4: at 1.5px tiles read thinner than the nodes) paints inside it.
      expect(layout.tile).toEqual({ x: 22, y: 4, width: 56, height: 56 });
      expect(svg).toContain(
        `<rect x="23" y="5" width="54" height="54" rx="1" fill="${shapePaint.fill}" stroke="${shapePaint.border}" stroke-width="2"/>`,
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
      // The glyph is the ink held at 4.5:1 on the tile.
      expect(svg).toContain(`viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${resolveIconTilePaint("violet", style, 56).glyph}" stroke-width="${strokeWidth}"`);
      for (const element of glyph.elements) {
        if (element.kind === "path") expect(svg).toContain(`d="${element.d}"`);
      }
    }
  });

  it("a white tile is the white node: its fill, a 2px edge inside the edge, the tile paint's glyph", () => {
    for (const theme of ["schematic-light", "schematic-dark"] as const) {
      const style = canvasThemePreset(theme);
      const svg = render([icon({ color: "white" })], theme);
      // The 56px tile centered in the 64px box (4..60), its 2px border (the node border width) inside the edge.
      expect(svg).toContain(
        `<rect x="5" y="5" width="54" height="54" rx="1" fill="${resolveShapePaint("white", style).fill}" stroke="${resolveShapePaint("white", style).border}" stroke-width="2"/>`,
      );
      expect(svg).toContain(`fill="none" stroke="${resolveIconTilePaint("white", style, 56).glyph}" stroke-width=`);
    }
  });

  it("fills a brand logo with its own brand color, never the object's color pick", () => {
    const brand = resolveIconGlyph("brand-docker", "tabler");
    expect(brand.paint).toBe("fill");
    // Simple Icons records Docker as #2496ED (tools/dev-icons/manifest.json).
    expect(brand.brandColor).toBe("#2496ED");
    const light = canvasThemePreset("schematic-light");
    const tiled = render([icon({ icon: "brand-docker" })], "schematic-light");
    // In its optical box (the generator's brand viewBox), not the 24-unit grid.
    expect(brand.viewBox).not.toEqual([0, 0, 24, 24]);
    expect(tiled).toContain(`viewBox="${brand.viewBox.join(" ")}" preserveAspectRatio="xMidYMid meet" fill="#2496ED" stroke="none"`);
    // On the neutral brand tile (the white node's fill and edge, stage B round 4), not the violet tile.
    const brandTile = resolveIconTilePaint("violet", light, 56, brand.brandColor);
    expect(brandTile.tileFill).toBe(resolveShapePaint("white", light).fill);
    expect(tiled).toContain(`fill="${brandTile.tileFill}" stroke="${brandTile.tileBorder}" stroke-width="2"`);
    expect(tiled).not.toContain(`stroke="${light.palette.violet}"`);
    const bare = render([icon({ icon: "brand-docker" })]);
    // Docker blue moved to 3:1 on the figjam board at its own hue (BRAND_MARK_MIN_CONTRAST).
    expect(bare).toContain(`fill="#1F93EA" stroke="none"`);
    expect(bare).not.toContain(`fill="${resolveIconPaint("violet", FIGJAM_CANVAS_STYLE).glyph}" stroke="none"`);
    expect(bare).not.toContain(`<g fill=`);
  });

  it("paints Claude Code's logo Claude orange on the default theme", () => {
    expect(render([icon({ icon: "brand-claude", text: "Claude Code" })], "schematic-light"))
      .toContain(`fill="#D97757" stroke="none"`);
  });

  it("falls back to the ink where a brand color would vanish: a black logo on the dark card", () => {
    const dark = canvasThemePreset("schematic-dark");
    const svg = render([icon({ icon: "brand-github" })], "schematic-dark");
    expect(svg).not.toContain(`fill="#181717" stroke="none"`);
    expect(svg).toContain(`fill="${dark.textColor}" stroke="none"`);
  });

  it("keeps tinting a generic glyph with its color pick", () => {
    const light = canvasThemePreset("schematic-light");
    expect(render([icon({ icon: "database" })], "schematic-light")).toContain(`stroke="${light.palette.violet}"`);
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
    const pastel = resolveShapePaint("violet", style).fill;
    expect(renderAt(72)).toContain(`fill="${pastel}" stroke="${ink}" stroke-width="2"/>`);
    const tinted = renderAt(170);
    const tint = resolveIconTilePaint("violet", style, 170);
    expect(tint.tileFill).toBe(mixColors(ink, style.cardFill, 0.16));
    expect(tinted).toContain(
      `<rect x="1" y="1" width="168" height="168" rx="1" fill="${tint.tileFill}" stroke="${ink}" stroke-width="2"/>`,
    );
    // The glyph viewport: 56px, centered on the 170px tile, stroked in the ink.
    expect(tinted).toContain(`<svg x="57" y="57" width="56" height="56" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="${ink}"`);
    // Under the preset's 56px cap the same box draws a node-paint 56px tile, centered.
    expect(render([icon({ geometry: { x: 0, y: 0, width: 170, height: 170 } })], "schematic-light")).toContain(
      `<rect x="58" y="58" width="54" height="54" rx="1" fill="${pastel}" stroke="${ink}" stroke-width="2"/>`,
    );
  });

  it("iconTileFill overrides the size rule both ways", () => {
    // Uncapped tile (iconTileMaxPx 240) so the 170px box is past iconTileSolidMaxPx and would auto-tint.
    const style = { ...canvasThemePreset("schematic-light"), iconTileMaxPx: 240 };
    const big = icon({ geometry: { x: 0, y: 0, width: 170, height: 170 } });
    const small = icon();
    const solidSvg = renderDocumentToSvg(documentOf([big]), { canvasStyle: { ...style, iconTileFill: "solid" } }).svg;
    expect(solidSvg).toContain(`fill="${resolveShapePaint("violet", style).fill}" stroke="${style.palette.violet}" stroke-width="2"/>`);
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
