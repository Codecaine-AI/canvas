"use client";

import { resolveIconGlyph, type IconGlyphDefinition, type IconGlyphElement, type IconPackId } from "./icon-glyphs";
import {
  ICON_TILE,
  glyphHasClosedInterior,
  iconBareGlyphStrokeWidth,
  iconTileGlyphStrokeWidth,
  iconTileLayout,
} from "./icon-tile";
import type { InteractiveCanvasObject } from "../../../state/schema";

/**
 * Minimal structural shape this component needs from an interactive canvas
 * object. Originally a hand-rolled structural type (the `icon` object type /
 * `icon` field hadn't landed in state/schema.ts yet when this file was
 * written, owned by a different in-flight wave); now that the real schema
 * has both, this is just a `Pick` of the fields actually used so the type
 * stays in lockstep with schema.ts without pulling in the full object shape.
 */
export type IconShapeBodyObject = Pick<InteractiveCanvasObject, "icon"> & {
  geometry: Pick<InteractiveCanvasObject["geometry"], "width" | "height">;
};

export type IconShapeBodyColors = {
  /** Glyph color: the stroke of outline glyphs, the fill of fill-paint (brand) glyphs (falls back to a sensible neutral if omitted). */
  stroke?: string;
  /** Optional fill painted into an outline glyph's own interiors (glyph style only). */
  fill?: string;
  /** Tile style: the tile body. Setting it draws the glyph inset on a rounded tile. */
  tileFill?: string;
  /** Tile style: the tile outline (tinted tiles, and the outlined `white` tile on light boards). */
  tileBorder?: string;
  /** Tile style: the outline's width, px, painted inside the tile edge (1 when omitted). */
  tileBorderWidthPx?: number;
};

function renderGlyphElement(element: IconGlyphElement, key: number) {
  if (element.kind === "path") {
    return <path key={key} d={element.d} />;
  }
  if (element.kind === "circle") {
    return <circle key={key} cx={element.cx} cy={element.cy} r={element.r} />;
  }
  return <line key={key} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />;
}

function isFillGlyphElement(element: IconGlyphElement) {
  return element.kind === "path" || element.kind === "circle";
}

/**
 * Pure presentational body for the `icon` shape family: renders the glyph
 * for `object.icon` from the `iconPack` corpus (objects/shapes/icon/
 * icon-glyphs.ts resolveIconGlyph), centered. The object's text renders
 * separately through the shared "below" text slot (objects/text-slots.ts),
 * so this component is glyph-only since the P2 text unification.
 *
 *  - Glyph style (no `tileFill`): the bare glyph fills the object box,
 *    stroked in `stroke` with optional `fill` inside its own closed
 *    interiors; a fill-paint (brand) glyph is filled with `stroke` instead.
 *  - Tile style (`tileFill` set): a rounded square tile — the glyph box's
 *    square, capped at `tileMaxPx` and centered — with the glyph inset on
 *    it (icon-tile.ts), absolutely positioned over
 *    the whole object box so it lands where the static renderer draws it.
 *
 * The caller (`objects/shapes/icon/def.tsx`) is responsible for the outer
 * button/positioning trim, matching how other shape bodies are composed.
 */
export function IconShapeBody({
  object,
  colors,
  iconPack = "nucleo",
  tileMaxPx,
}: {
  object: IconShapeBodyObject;
  colors?: IconShapeBodyColors;
  /** The glyph corpus (the canvas style's `iconPack`); nucleo by default. */
  iconPack?: IconPackId;
  /** Tile style: the largest tile side (the canvas style's `iconTileMaxPx`); uncapped when omitted. */
  tileMaxPx?: number;
}) {
  const glyph = resolveIconGlyph(object.icon, iconPack);
  const stroke = colors?.stroke ?? "#1D1D1D";
  if (colors?.tileFill) {
    return (
      <IconTileBody
        object={object}
        glyph={glyph}
        glyphColor={stroke}
        tileFill={colors.tileFill}
        tileBorder={colors.tileBorder}
        tileBorderWidthPx={colors.tileBorderWidthPx ?? 1}
        tileMaxPx={tileMaxPx}
      />
    );
  }
  const fill = colors?.fill;
  const sizePx = Math.min(object.geometry.width, object.geometry.height);
  const filledGlyph = glyph?.paint === "fill";
  // SVG fills open paths by chord-closing them. For mixed glyphs those chords
  // are either overpainted by a later same-color container fill in this layer,
  // hidden under the element's own ink stroke, or are the intended interior
  // (archive/database/coin/package). All-open line-art glyphs would expose
  // naked chord-fill triangles, so gate fills on at least one closed element.
  const shouldRenderFillLayer = Boolean(fill && !filledGlyph && glyph && glyphHasClosedInterior(glyph));

  return (
    <div
      data-canvas-icon-shape-body=""
      data-canvas-icon-id={glyph?.id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox={glyph ? `0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}` : "0 0 18 18"}
        style={{ width: "100%", height: "100%" }}
        {...(filledGlyph
          ? { fill: stroke, stroke: "none" }
          : {
              fill: "none",
              stroke,
              strokeWidth: iconBareGlyphStrokeWidth(sizePx, glyph),
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
            })}
        aria-hidden="true"
        data-canvas-icon-glyph={glyph?.id ?? "unknown"}
      >
        {shouldRenderFillLayer ? (
          <g data-canvas-icon-fill-layer="" fill={fill} stroke="none">
            {glyph?.elements.map((element, index) => (isFillGlyphElement(element) ? renderGlyphElement(element, index) : null))}
          </g>
        ) : null}
        <g data-canvas-icon-ink-layer="">
          {glyph?.elements.map((element, index) => renderGlyphElement(element, index))}
        </g>
      </svg>
    </div>
  );
}

/**
 * Tile style: one SVG in object-local px over the whole object box — the
 * rounded tile, then the glyph in a nested viewport inset on it.
 */
function IconTileBody({
  object,
  glyph,
  glyphColor,
  tileFill,
  tileBorder,
  tileBorderWidthPx,
  tileMaxPx,
}: {
  object: IconShapeBodyObject;
  glyph: IconGlyphDefinition | undefined;
  glyphColor: string;
  tileFill: string;
  tileBorder: string | undefined;
  tileBorderWidthPx: number;
  tileMaxPx: number | undefined;
}) {
  const { width, height } = object.geometry;
  const layout = iconTileLayout(width, height, tileMaxPx);
  const border = tileBorder ? tileBorderWidthPx : 0;
  const filledGlyph = glyph?.paint === "fill";
  return (
    <div
      data-canvas-icon-shape-body=""
      data-canvas-icon-id={glyph?.id}
      data-canvas-icon-style="tile"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%", height: "100%", overflow: "visible" }}
        aria-hidden="true"
      >
        <rect
          data-canvas-icon-tile=""
          x={layout.tile.x + border / 2}
          y={layout.tile.y + border / 2}
          width={Math.max(0, layout.tile.width - border)}
          height={Math.max(0, layout.tile.height - border)}
          rx={Math.max(0, ICON_TILE.cornerRadiusPx - border / 2)}
          fill={tileFill}
          {...(tileBorder ? { stroke: tileBorder, strokeWidth: border } : null)}
        />
        {glyph ? (
          <svg
            x={layout.glyph.x}
            y={layout.glyph.y}
            width={layout.glyph.width}
            height={layout.glyph.height}
            viewBox={`0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}`}
            {...(filledGlyph
              ? { fill: glyphColor, stroke: "none" }
              : {
                  fill: "none",
                  stroke: glyphColor,
                  strokeWidth: iconTileGlyphStrokeWidth(glyph.viewBoxSize),
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                })}
            data-canvas-icon-glyph={glyph.id}
          >
            <g data-canvas-icon-ink-layer="">
              {glyph.elements.map((element, index) => renderGlyphElement(element, index))}
            </g>
          </svg>
        ) : null}
      </svg>
    </div>
  );
}
