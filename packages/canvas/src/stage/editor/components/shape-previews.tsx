"use client";

/**
 * shape-previews.tsx — the picker preview SVGs for the shape catalog
 * (co-location alignment: moved out of objects/catalog/shape-catalog.tsx,
 * which is now pure data at objects/catalog.ts). ShapesPanel and
 * ShapeSearchPopover resolve each catalog entry's 20x20 monochrome preview
 * through `shapeCatalogPreview(entry)`.
 *
 * Preview strategy (re-audited at P4 — derive where the def's geometry makes
 * it trivial, keep documented explicit minis where a literal outline reads
 * worse at 20x20):
 *   - Shape entries whose outline is one of objects/geometry.ts's
 *     true-outline polygon generators (ellipse/triangle/octagon) reuse that
 *     EXACT generator function — the SAME vertex math the def's `outline`
 *     spec, the on-canvas silhouette, anchors, and hit-testing all share
 *     since P3 — against a small local `PREVIEW_BOUNDS` box, so the picker
 *     glyph derives from the def's geometry — see `polygonIcon()`.
 *   - Bbox-outline entries whose silhouette is custom def SVG
 *     (predefined-process/arrow-shape/square/rounded-rect/diamond) keep
 *     small hand-drawn inline SVG minis using the same visual motif the def
 *     renders — deliberately NOT derived: their real outlines are plain
 *     bboxes (or read better as motif minis at 20x20).
 *   - Icon entries (all 30 glyphs) reuse the glyph paths directly from the
 *     ICON_GLYPHS registry (the same registry IconShapeBody renders
 *     on-canvas) via `iconGlyphPreview()`.
 */

import type { CanvasBounds } from "../../../state/geometry";
import { defaultGeometryFor } from "../../../state/schema/object-defaults";
import type { ShapeCatalogEntry } from "../../../objects/catalog";
import { ICON_GLYPHS, iconGlyphStrokeWidthForSize, type IconGlyphId } from "../../../objects/shapes/icon/icon-glyphs";
import {
  ellipsePoints,
  octagonPoints,
  trianglePoints,
} from "../../../objects/geometry";

/** Inline SVG preview, 20x20 viewBox, monochrome (currentColor). */
export type ShapePreviewIcon = (props: { className?: string }) => React.JSX.Element;

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------

const S = 1.1; // stroke width for the 20x20 preview grid (lightened to match FigJam's icon weight)

/** Shared local bounds every true-outline polygon preview is generated against — a 16x16 box inset 2px inside the 20x20 viewBox. */
const PREVIEW_BOUNDS: CanvasBounds = { x: 2, y: 2, width: 16, height: 16 };

function pointsToAttr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Builds a preview component from one of objects/geometry.ts's true-outline polygon generators (the def outline's own vertex math), so the tiny picker glyph is geometrically identical to the real on-canvas outline. */
function polygonIcon(points: { x: number; y: number }[]): ShapePreviewIcon {
  const attr = pointsToAttr(points);
  return function PolygonPreview({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
        <polygon points={attr} stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
      </svg>
    );
  };
}

function svgIcon(children: string): ShapePreviewIcon {
  return function Icon({ className }: { className?: string }) {
    return (
      // eslint-disable-next-line react/no-danger -- static trusted glyph strings only, no user input
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: children }} />
    );
  };
}

/**
 * Stroke width (viewBox units) for the icon picker previews: the EXACT
 * stroke the on-canvas renderer (IconShapeBody) computes for an icon at
 * its default placed size, via the same `iconGlyphStrokeWidthForSize`
 * step-down. Stroke in viewBox units is scale-invariant, so the picker glyph
 * is a faithful miniature of the icon a click will draw — same line weight
 * relative to the glyph, no separate hand-tuned preview constant.
 */
const iconDefaultGeometry = defaultGeometryFor("icon");
const ICON_PREVIEW_STROKE_WIDTH = iconGlyphStrokeWidthForSize(
  Math.min(iconDefaultGeometry.width, iconDefaultGeometry.height),
);

/** Icon preview: renders the exact glyph path data from the ICON_GLYPHS registry (same source IconShapeBody draws on-canvas), re-projected onto the preview viewBox, stroked with the same width the default-size placed icon draws with (ICON_PREVIEW_STROKE_WIDTH). */
function iconGlyphPreview(glyphId: IconGlyphId): ShapePreviewIcon {
  const glyph = ICON_GLYPHS[glyphId];
  return function IconGlyphPreview({ className }: { className?: string }) {
    return (
      <svg viewBox={`0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}`} className={className} fill="none" aria-hidden="true">
        <g
          stroke="currentColor"
          strokeWidth={ICON_PREVIEW_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {glyph.elements.map((element, index) => {
            if (element.kind === "path") {
              // eslint-disable-next-line react/no-array-index-key -- glyph element lists are static, position-stable
              return <path key={index} d={element.d} />;
            }
            if (element.kind === "circle") {
              // eslint-disable-next-line react/no-array-index-key -- glyph element lists are static, position-stable
              return <circle key={index} cx={element.cx} cy={element.cy} r={element.r} />;
            }
            // eslint-disable-next-line react/no-array-index-key -- glyph element lists are static, position-stable
            return <line key={index} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />;
          })}
        </g>
      </svg>
    );
  };
}

// ---------------------------------------------------------------------------
// True-outline polygon previews — geometrically identical to the object
// defs' real silhouettes, generated from the same functions.
// ---------------------------------------------------------------------------

const EllipseIcon = polygonIcon(ellipsePoints(PREVIEW_BOUNDS));
const TriangleUpIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "up"));
const TriangleDownIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "down"));
const OctagonIcon = polygonIcon(octagonPoints(PREVIEW_BOUNDS));

// ---------------------------------------------------------------------------
// Hand-drawn bbox-tier previews (types whose on-canvas silhouette is custom
// inline SVG rather than a shared point-generator) — simplified minis
// matching each type's real on-canvas motif (predefined-process's double
// bars, the fat arrow silhouette).
// ---------------------------------------------------------------------------

const SquareIcon = svgIcon(`<rect x="4" y="4" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="${S}" />`);
const RoundedRectIcon = svgIcon(`<rect x="3.5" y="5.5" width="13" height="9" rx="3" stroke="currentColor" stroke-width="${S}" />`);
const DiamondIcon = svgIcon(`<path d="M10 3.5 16.5 10 10 16.5 3.5 10Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
const PredefinedProcessIcon = svgIcon(
  `<rect x="3.5" y="5.5" width="13" height="9" stroke="currentColor" stroke-width="${S}" /><path d="M6.5 5.5v9M13.5 5.5v9" stroke="currentColor" stroke-width="${S}" />`,
);
const ArrowShapeRightIcon = svgIcon(
  `<path d="M3 7.5h8v-2l6 4.5-6 4.5v-2H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const ArrowShapeLeftIcon = svgIcon(
  `<path d="M17 12.5H9v2l-6-4.5 6-4.5v2h8Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);

// ---------------------------------------------------------------------------
// Entry -> preview resolution
// ---------------------------------------------------------------------------

/** Shape previews keyed by catalog entry id (icon entries resolve via glyph id below). */
const PREVIEWS_BY_ENTRY_ID: Readonly<Record<string, ShapePreviewIcon>> = {
  "shape-square": SquareIcon,
  "shape-rounded-rect": RoundedRectIcon,
  "shape-predefined-process": PredefinedProcessIcon,
  "shape-decision-diamond": DiamondIcon,
  "shape-triangle-up": TriangleUpIcon,
  "shape-triangle-down": TriangleDownIcon,
  "shape-ellipse": EllipseIcon,
  "shape-arrow-left": ArrowShapeLeftIcon,
  "shape-arrow-right": ArrowShapeRightIcon,
  "shape-octagon": OctagonIcon,
};

/** Icon previews built once per glyph so component identity is stable across renders. */
const GLYPH_PREVIEWS: Readonly<Record<string, ShapePreviewIcon>> = Object.fromEntries(
  (Object.keys(ICON_GLYPHS) as IconGlyphId[]).map((glyphId) => [glyphId, iconGlyphPreview(glyphId)]),
);

/** Renders nothing — only reachable for an out-of-vocabulary entry (the coverage test proves every real entry resolves). */
const EmptyPreview: ShapePreviewIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" />
);

/**
 * The preview component for a catalog entry: icon entries (`objectType:
 * "icon"`) resolve by glyph id, everything else by entry id.
 */
export function shapeCatalogPreview(
  entry: Pick<ShapeCatalogEntry, "id" | "objectType" | "icon">,
): ShapePreviewIcon {
  if (entry.objectType === "icon" && entry.icon) {
    return GLYPH_PREVIEWS[entry.icon] ?? EmptyPreview;
  }
  return PREVIEWS_BY_ENTRY_ID[entry.id] ?? EmptyPreview;
}
