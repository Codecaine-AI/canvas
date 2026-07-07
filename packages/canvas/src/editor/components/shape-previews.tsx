"use client";

/**
 * shape-previews.tsx — the picker preview SVGs for the shape catalog
 * (co-location alignment: moved out of objects/catalog/shape-catalog.tsx,
 * which is now pure data at objects/catalog.ts). ShapesPanel and
 * ShapeSearchPopover resolve each catalog entry's 20x20 monochrome preview
 * through `shapeCatalogPreview(entry)`.
 *
 * Preview strategy (unchanged from the Wave C catalog rewrite):
 *   - Basic/Flowchart entries whose outline is one of connection-overlay.ts's
 *     true-outline polygon generators (ellipse/triangle/parallelogram/
 *     pentagon/octagon/star/plus/chevron/trapezoid/manual-input/hexagon)
 *     reuse that EXACT generator function against a small local
 *     `PREVIEW_BOUNDS` box, guaranteeing the tiny picker glyph is
 *     geometrically identical (same vertex math) to what CanvasStage.tsx
 *     actually draws on the canvas — see `polygonIcon()` below.
 *   - Basic/Flowchart entries that are bbox-tier custom SVG in CanvasStage
 *     (database/document/folder/document-stack/cylinder-horizontal/
 *     predefined-process/internal-storage/junctions/arrow-shape/square/
 *     rounded-rect/chat) get small hand-drawn inline SVG minis using the same
 *     visual motif CanvasStage renders (wavy-bottom document, folder tab,
 *     double-stacked pages, horizontal cylinder, etc.).
 *   - Advanced-tier entries (all 26 icon glyphs) reuse the glyph paths
 *     directly from the ICON_GLYPHS registry (the same registry
 *     IconShapeBody renders on-canvas) via `iconGlyphPreview()`.
 */

import type { CanvasBounds } from "../../state/geometry";
import type { ShapeCatalogEntry } from "../../objects/catalog";
import { ICON_GLYPHS, ICON_GLYPH_STROKE_WIDTH, type IconGlyphId } from "../../ui/icons/icon-glyphs";
import {
  chevronPoints,
  ellipsePoints,
  hexagonPoints,
  manualInputPoints,
  octagonPoints,
  parallelogramPoints,
  pentagonPoints,
  plusPoints,
  starPoints,
  trapezoidPoints,
  trianglePoints,
} from "../../routing/connection-overlay";

/** Inline SVG preview, 20x20 viewBox, monochrome (currentColor). */
export type ShapePreviewIcon = (props: { className?: string }) => React.JSX.Element;

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------

const S = 1.4; // stroke width for the 20x20 preview grid (matches the pre-existing convention)

/** Shared local bounds every true-outline polygon preview is generated against — a 16x16 box inset 2px inside the 20x20 viewBox. */
const PREVIEW_BOUNDS: CanvasBounds = { x: 2, y: 2, width: 16, height: 16 };

function pointsToAttr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Builds a preview component from one of connection-overlay.ts's true-outline polygon generators, so the tiny picker glyph is geometrically identical to the real on-canvas outline. */
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

/** Advanced-tier preview: renders the exact glyph path data from the ICON_GLYPHS registry (same source IconShapeBody draws on-canvas), re-projected onto the preview viewBox. */
function iconGlyphPreview(glyphId: IconGlyphId): ShapePreviewIcon {
  const glyph = ICON_GLYPHS[glyphId];
  return function IconGlyphPreview({ className }: { className?: string }) {
    return (
      <svg viewBox={`0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}`} className={className} fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth={ICON_GLYPH_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
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
// True-outline polygon previews (Basic + Flowchart) — geometrically identical
// to CanvasStage.tsx's real silhouettes, generated from the same functions.
// ---------------------------------------------------------------------------

const EllipseIcon = polygonIcon(ellipsePoints(PREVIEW_BOUNDS));
const TriangleUpIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "up"));
const TriangleDownIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "down"));
const ParallelogramRightIcon = polygonIcon(parallelogramPoints(PREVIEW_BOUNDS, "right"));
const ParallelogramLeftIcon = polygonIcon(parallelogramPoints(PREVIEW_BOUNDS, "left"));
const PentagonIcon = polygonIcon(pentagonPoints(PREVIEW_BOUNDS));
const OctagonIcon = polygonIcon(octagonPoints(PREVIEW_BOUNDS));
const StarIcon = polygonIcon(starPoints(PREVIEW_BOUNDS));
const PlusShapeIcon = polygonIcon(plusPoints(PREVIEW_BOUNDS));
const ChevronRightIcon = polygonIcon(chevronPoints(PREVIEW_BOUNDS, "right"));
const TrapezoidIcon = polygonIcon(trapezoidPoints(PREVIEW_BOUNDS));
const ManualInputIcon = polygonIcon(manualInputPoints(PREVIEW_BOUNDS));
const HexagonIcon = polygonIcon(hexagonPoints(PREVIEW_BOUNDS));

/** Off-page-connector: downward pentagon/"shield" silhouette (see connection-overlay.ts's offPageConnectorPoints doc comment on the SHIELD naming note). */
const OffPageConnectorIcon = svgIcon(
  `<path d="M3 4h14v7.2L10 17 3 11.2Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);

// ---------------------------------------------------------------------------
// Hand-drawn bbox-tier previews (Basic + Flowchart types whose CanvasStage
// silhouette is custom inline SVG rather than a shared point-generator) —
// same simplified-mini approach as the pre-existing icons, matching each
// type's real on-canvas motif (documentWavyPath, the folder tab, the
// document-stack double-page offset, the horizontal/vertical cylinder
// silhouettes, predefined-process's double bars, internal-storage's corner
// rules, and the plain junction circle in CanvasStage.tsx).
// ---------------------------------------------------------------------------

const SquareIcon = svgIcon(`<rect x="4" y="4" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="${S}" />`);
const RoundedRectIcon = svgIcon(`<rect x="3.5" y="5.5" width="13" height="9" rx="3" stroke="currentColor" stroke-width="${S}" />`);
const DiamondIcon = svgIcon(`<path d="M10 3.5 16.5 10 10 16.5 3.5 10Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
const SpeechBubbleIcon = svgIcon(
  `<path d="M3.5 4.5h13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H9l-3 3v-3H3.5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const DatabaseIcon = svgIcon(
  `<path d="M3.5 6c0-1.4 2.9-2.3 6.5-2.3s6.5.9 6.5 2.3v8c0 1.4-2.9 2.3-6.5 2.3S3.5 15.4 3.5 14Z" stroke="currentColor" stroke-width="${S}" /><path d="M16.5 6c0 1.4-2.9 2.3-6.5 2.3S3.5 7.4 3.5 6" stroke="currentColor" stroke-width="${S}" />`,
);
const CylinderHorizontalIcon = svgIcon(
  `<path d="M5.5 4.5h9c1.7 0 2.5 2.5 2.5 5.5s-.8 5.5-2.5 5.5h-9c-1.7 0-2.5-2.5-2.5-5.5s.8-5.5 2.5-5.5Z" stroke="currentColor" stroke-width="${S}" /><path d="M5.5 4.5c1.4 0 2.2 2.5 2.2 5.5s-.8 5.5-2.2 5.5" stroke="currentColor" stroke-width="${S}" />`,
);
const PageCornerIcon = svgIcon(
  `<path d="M5 3.5h6.5L16.5 8.5V16.5H5Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" /><path d="M11.5 3.5V8.5H16.5" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const FolderIcon = svgIcon(
  `<path d="M3 6.5h4.5l1.5 1.7H17V16H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const DocumentIcon = svgIcon(
  `<path d="M4 3.5h12v9.3c-1.4 0-1.4 1.7-2.8 1.7s-1.4-1.7-2.8-1.7-1.4 1.7-2.8 1.7-1.4-1.7-2.8-1.7Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const DocumentStackIcon = svgIcon(
  `<path d="M6 5.5h10v8c-1.2 0-1.2 1.4-2.4 1.4S12.4 13.5 11.2 13.5s-1.2 1.4-2.4 1.4S7.2 13.5 6 13.5Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" opacity="0.55" /><path d="M4 3.5h10v8c-1.2 0-1.2 1.4-2.4 1.4S10.4 11.5 9.2 11.5 8 12.9 6.8 12.9 5.6 11.5 4.4 11.5" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
const PredefinedProcessIcon = svgIcon(
  `<rect x="3.5" y="5.5" width="13" height="9" stroke="currentColor" stroke-width="${S}" /><path d="M6.5 5.5v9M13.5 5.5v9" stroke="currentColor" stroke-width="${S}" />`,
);
const InternalStorageIcon = svgIcon(
  `<rect x="3.5" y="4.5" width="13" height="11" stroke="currentColor" stroke-width="${S}" /><path d="M3.5 7.5h13M6.5 4.5v3" stroke="currentColor" stroke-width="${S}" />`,
);
const OrJunctionIcon = svgIcon(`<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="${S}" />`);
const SummingJunctionIcon = svgIcon(
  `<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="${S}" /><path d="M10 6.5v7M6.5 10h7" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`,
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

/** Basic/Flowchart previews keyed by catalog entry id (Advanced resolves via glyph id below). */
const PREVIEWS_BY_ENTRY_ID: Readonly<Record<string, ShapePreviewIcon>> = {
  "basic-square": SquareIcon,
  "basic-ellipse": EllipseIcon,
  "basic-decision-diamond": DiamondIcon,
  "basic-triangle-up": TriangleUpIcon,
  "basic-triangle-down": TriangleDownIcon,
  "basic-rounded-rect": RoundedRectIcon,
  "basic-pentagon": PentagonIcon,
  "basic-octagon": OctagonIcon,
  "basic-plus": PlusShapeIcon,
  "basic-arrow-left": ArrowShapeLeftIcon,
  "basic-arrow-right": ArrowShapeRightIcon,
  "basic-chevron": ChevronRightIcon,
  "basic-star": StarIcon,
  "basic-chat": SpeechBubbleIcon,
  "flow-parallelogram-right": ParallelogramRightIcon,
  "flow-parallelogram-left": ParallelogramLeftIcon,
  "flow-database": DatabaseIcon,
  "flow-cylinder-horizontal": CylinderHorizontalIcon,
  "flow-page-corner": PageCornerIcon,
  "flow-folder": FolderIcon,
  "flow-document": DocumentIcon,
  "flow-document-stack": DocumentStackIcon,
  "flow-predefined-process": PredefinedProcessIcon,
  "flow-off-page-connector": OffPageConnectorIcon,
  "flow-trapezoid": TrapezoidIcon,
  "flow-manual-input": ManualInputIcon,
  "flow-hexagon": HexagonIcon,
  "flow-internal-storage": InternalStorageIcon,
  "flow-or-junction": OrJunctionIcon,
  "flow-summing-junction": SummingJunctionIcon,
};

/** Advanced-tier previews built once per glyph so component identity is stable across renders. */
const GLYPH_PREVIEWS: Readonly<Record<string, ShapePreviewIcon>> = Object.fromEntries(
  (Object.keys(ICON_GLYPHS) as IconGlyphId[]).map((glyphId) => [glyphId, iconGlyphPreview(glyphId)]),
);

/** Renders nothing — only reachable for an out-of-vocabulary entry (the coverage test proves every real entry resolves). */
const EmptyPreview: ShapePreviewIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" />
);

/**
 * The preview component for a catalog entry: Advanced (`objectType: "icon"`)
 * entries resolve by glyph id, everything else by entry id.
 */
export function shapeCatalogPreview(
  entry: Pick<ShapeCatalogEntry, "id" | "objectType" | "icon">,
): ShapePreviewIcon {
  if (entry.objectType === "icon" && entry.icon) {
    return GLYPH_PREVIEWS[entry.icon] ?? EmptyPreview;
  }
  return PREVIEWS_BY_ENTRY_ID[entry.id] ?? EmptyPreview;
}
