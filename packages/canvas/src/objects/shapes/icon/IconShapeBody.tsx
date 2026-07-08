"use client";

import { ICON_GLYPHS, ICON_GLYPH_STROKE_WIDTH, type IconGlyphElement, type IconGlyphId } from "./icon-glyphs";
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
  /** Glyph stroke color (falls back to a sensible neutral if omitted). */
  stroke?: string;
  /** Optional fill painted into the glyph's own interiors. */
  fill?: string;
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

function glyphElementHasClosedInterior(element: IconGlyphElement) {
  return element.kind === "circle" || (element.kind === "path" && /[zZ]/.test(element.d));
}

/**
 * Pure presentational body for the `icon` shape family: renders the resolved
 * glyph, centered, with optional fill inside the glyph's own interiors. The
 * object's text renders separately through the shared "below" text slot
 * (objects/text-slots.ts — bold black text in the band under the glyph), so
 * this component is glyph-only since the P2 text unification.
 *
 * The caller (`objects/shapes/icon/def.tsx`) is responsible for the outer
 * button/positioning chrome, matching how other shape bodies are composed.
 */
export function IconShapeBody({
  object,
  colors,
}: {
  object: IconShapeBodyObject;
  colors?: IconShapeBodyColors;
}) {
  const glyphId = object.icon as IconGlyphId | undefined;
  const glyph = glyphId ? ICON_GLYPHS[glyphId] : undefined;
  const stroke = colors?.stroke ?? "#1D1D1D";
  const fill = colors?.fill;
  // SVG fills open paths by chord-closing them. For mixed glyphs those chords
  // are either overpainted by a later same-color container fill in this layer,
  // hidden under the element's own ink stroke, or are the intended interior
  // (archive/database/coin/package). All-open line-art glyphs would expose
  // naked chord-fill triangles, so gate fills on at least one closed element.
  const shouldRenderFillLayer = Boolean(fill && glyph?.elements.some(glyphElementHasClosedInterior));

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
        fill="none"
        stroke={stroke}
        strokeWidth={ICON_GLYPH_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
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
