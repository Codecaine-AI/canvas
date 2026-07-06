"use client";

/**
 * shape-catalog.tsx — data for ShapeSearchPopover + ShapesPanel.
 *
 * NOTE ON FILE EXTENSION: entries carry inline JSX preview components, which
 * requires the `.tsx` extension to compile under this repo's TypeScript/JSX
 * settings — so this is `shape-catalog.tsx`, not `.ts`. It remains a
 * pure-data module (no component state, no editor wiring).
 *
 * Wave C rewrite: restructured to mirror FigJam's actual picker model per
 * docs/10-system-design/20-figjam-parity/doc.json — exactly 3 sections
 * (Basic / Flowchart / Advanced), no Recents/Connections/"Other libraries"
 * (those were placeholders from before the real W5 shape vocabulary landed;
 * connectors are a dock-only tool — see CanvasDock.tsx's `"connector"`
 * ToolId — not a Shapes-panel concept). `objectType` now maps to the REAL
 * `InteractiveCanvasObjectType` from ../state/schema (all 19 W5 native types
 * + "icon" are live), so every entry in this catalog is enabled — there is
 * no more "coming soon" disabled state.
 *
 * Preview strategy:
 *   - Basic/Flowchart entries whose outline is one of connection-overlay.ts's
 *     true-outline polygon generators (ellipse/triangle/parallelogram/
 *     pentagon/octagon/star/plus/chevron/off-page-connector/trapezoid/
 *     manual-input/hexagon) reuse that EXACT generator function against a
 *     small local `PREVIEW_BOUNDS` box, guaranteeing the tiny picker glyph is
 *     geometrically identical (same vertex math) to what CanvasStage.tsx
 *     actually draws on the canvas — see `polygonIcon()` below.
 *   - Basic/Flowchart entries that are bbox-tier custom SVG in CanvasStage
 *     (database/document/folder/document-stack/cylinder-horizontal/
 *     predefined-process/internal-storage/junctions/arrow-shape/square/
 *     rounded-rect/chat) get small hand-drawn inline SVG minis using the same
 *     visual motif CanvasStage renders (wavy-bottom document, folder tab,
 *     double-stacked pages, horizontal cylinder, etc.), consistent with this
 *     file's pre-existing hand-drawn preview style (RectangleIcon, CylinderIcon,
 *     FolderIcon, TrapezoidIcon, ... below).
 *   - Advanced-tier entries (all 26 icon glyphs) reuse the glyph paths
 *     directly from ui/icons/icon-glyphs.tsx's ICON_GLYPHS registry (the same
 *     registry IconShapeBody renders on-canvas) via `iconGlyphPreview()` —
 *     both now live under objects/ (catalog/ and shapes/icon/), so this is a
 *     same-layer import.
 */

import type { CanvasBounds } from "../../state/geometry";
import type { CanvasIconGlyph, CanvasShapeDirection, InteractiveCanvasObjectType } from "../../state/schema";
import { ICON_GLYPHS, type IconGlyphId } from "../../ui/icons/icon-glyphs";
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

export type ShapeCatalogEntry = {
  id: string;
  label: string;
  objectType: InteractiveCanvasObjectType;
  /** Direction/orientation field for direction-aware shapes (triangle up|down; parallelogram/chevron/arrow-shape left|right). Passed straight through to the inserted object's `direction`. */
  direction?: CanvasShapeDirection;
  /** REQUIRED when objectType === "icon" — selects which of the 26 Advanced-tier glyphs to insert. */
  icon?: CanvasIconGlyph;
  /** Inline SVG preview, 20x20 viewBox, monochrome (currentColor). */
  Icon: (props: { className?: string }) => React.JSX.Element;
};

export type ShapeCatalogCategory = {
  id: string;
  label: string;
  entries: ShapeCatalogEntry[];
};

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------

const S = 1.4; // stroke width for the 20x20 preview grid (matches this file's pre-existing convention)

/** Shared local bounds every true-outline polygon preview is generated against — a 16x16 box inset 2px inside the 20x20 viewBox. */
const PREVIEW_BOUNDS: CanvasBounds = { x: 2, y: 2, width: 16, height: 16 };

function pointsToAttr(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Builds a preview component from one of connection-overlay.ts's true-outline polygon generators, so the tiny picker glyph is geometrically identical to the real on-canvas outline. */
function polygonIcon(points: { x: number; y: number }[]) {
  const attr = pointsToAttr(points);
  return function PolygonPreview({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
        <polygon points={attr} stroke="currentColor" strokeWidth={S} strokeLinejoin="round" />
      </svg>
    );
  };
}

function svgIcon(children: string) {
  return function Icon({ className }: { className?: string }) {
    return (
      // eslint-disable-next-line react/no-danger -- static trusted glyph strings only, no user input
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: children }} />
    );
  };
}

/** Advanced-tier preview: renders the exact glyph path data from ui/icons/icon-glyphs.tsx's ICON_GLYPHS registry (same source IconShapeBody draws on-canvas), re-projected onto the 20x20 preview viewBox. */
function iconGlyphPreview(glyphId: IconGlyphId) {
  const glyph = ICON_GLYPHS[glyphId];
  return function IconGlyphPreview({ className }: { className?: string }) {
    return (
      <svg viewBox={`0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}`} className={className} fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

export const EllipseIcon = polygonIcon(ellipsePoints(PREVIEW_BOUNDS));
export const TriangleUpIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "up"));
export const TriangleDownIcon = polygonIcon(trianglePoints(PREVIEW_BOUNDS, "down"));
export const ParallelogramRightIcon = polygonIcon(parallelogramPoints(PREVIEW_BOUNDS, "right"));
export const ParallelogramLeftIcon = polygonIcon(parallelogramPoints(PREVIEW_BOUNDS, "left"));
export const PentagonIcon = polygonIcon(pentagonPoints(PREVIEW_BOUNDS));
export const OctagonIcon = polygonIcon(octagonPoints(PREVIEW_BOUNDS));
export const StarIcon = polygonIcon(starPoints(PREVIEW_BOUNDS));
export const PlusShapeIcon = polygonIcon(plusPoints(PREVIEW_BOUNDS));
export const ChevronRightIcon = polygonIcon(chevronPoints(PREVIEW_BOUNDS, "right"));
export const TrapezoidIcon = polygonIcon(trapezoidPoints(PREVIEW_BOUNDS));
export const ManualInputIcon = polygonIcon(manualInputPoints(PREVIEW_BOUNDS));
export const HexagonIcon = polygonIcon(hexagonPoints(PREVIEW_BOUNDS));

/** Off-page-connector: downward pentagon/"shield" silhouette (see connection-overlay.ts's offPageConnectorPoints doc comment on the SHIELD naming note). */
export const OffPageConnectorIcon = svgIcon(
  `<path d="M3 4h14v7.2L10 17 3 11.2Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);

// ---------------------------------------------------------------------------
// Hand-drawn bbox-tier previews (Basic + Flowchart types whose CanvasStage
// silhouette is custom inline SVG rather than a shared point-generator) —
// same simplified-mini approach as this file's pre-existing icons, matching
// each type's real on-canvas motif (documentWavyPath, FOLDER_GEOMETRY's tab,
// DOCUMENT_STACK_GEOMETRY's double-page offset, the horizontal/vertical
// cylinder silhouettes, predefined-process's double bars, internal-storage's
// corner rules, and the plain junction circle in CanvasStage.tsx).
// ---------------------------------------------------------------------------

export const SquareIcon = svgIcon(`<rect x="4" y="4" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="${S}" />`);
export const RoundedRectIcon = svgIcon(`<rect x="3.5" y="5.5" width="13" height="9" rx="3" stroke="currentColor" stroke-width="${S}" />`);
export const DiamondIcon = svgIcon(`<path d="M10 3.5 16.5 10 10 16.5 3.5 10Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`);
export const SpeechBubbleIcon = svgIcon(
  `<path d="M3.5 4.5h13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H9l-3 3v-3H3.5a1 1 0 0 1-1-1v-6.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const DatabaseIcon = svgIcon(
  `<path d="M3.5 6c0-1.4 2.9-2.3 6.5-2.3s6.5.9 6.5 2.3v8c0 1.4-2.9 2.3-6.5 2.3S3.5 15.4 3.5 14Z" stroke="currentColor" stroke-width="${S}" /><path d="M16.5 6c0 1.4-2.9 2.3-6.5 2.3S3.5 7.4 3.5 6" stroke="currentColor" stroke-width="${S}" />`,
);
export const CylinderHorizontalIcon = svgIcon(
  `<path d="M5.5 4.5h9c1.7 0 2.5 2.5 2.5 5.5s-.8 5.5-2.5 5.5h-9c-1.7 0-2.5-2.5-2.5-5.5s.8-5.5 2.5-5.5Z" stroke="currentColor" stroke-width="${S}" /><path d="M5.5 4.5c1.4 0 2.2 2.5 2.2 5.5s-.8 5.5-2.2 5.5" stroke="currentColor" stroke-width="${S}" />`,
);
export const PageCornerIcon = svgIcon(
  `<path d="M5 3.5h6.5L16.5 8.5V16.5H5Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" /><path d="M11.5 3.5V8.5H16.5" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const FolderIcon = svgIcon(
  `<path d="M3 6.5h4.5l1.5 1.7H17V16H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const DocumentIcon = svgIcon(
  `<path d="M4 3.5h12v9.3c-1.4 0-1.4 1.7-2.8 1.7s-1.4-1.7-2.8-1.7-1.4 1.7-2.8 1.7-1.4-1.7-2.8-1.7Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const DocumentStackIcon = svgIcon(
  `<path d="M6 5.5h10v8c-1.2 0-1.2 1.4-2.4 1.4S12.4 13.5 11.2 13.5s-1.2 1.4-2.4 1.4S7.2 13.5 6 13.5Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" opacity="0.55" /><path d="M4 3.5h10v8c-1.2 0-1.2 1.4-2.4 1.4S10.4 11.5 9.2 11.5 8 12.9 6.8 12.9 5.6 11.5 4.4 11.5" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const PredefinedProcessIcon = svgIcon(
  `<rect x="3.5" y="5.5" width="13" height="9" stroke="currentColor" stroke-width="${S}" /><path d="M6.5 5.5v9M13.5 5.5v9" stroke="currentColor" stroke-width="${S}" />`,
);
export const InternalStorageIcon = svgIcon(
  `<rect x="3.5" y="4.5" width="13" height="11" stroke="currentColor" stroke-width="${S}" /><path d="M3.5 7.5h13M6.5 4.5v3" stroke="currentColor" stroke-width="${S}" />`,
);
export const OrJunctionIcon = svgIcon(`<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="${S}" />`);
export const SummingJunctionIcon = svgIcon(
  `<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="${S}" /><path d="M10 6.5v7M6.5 10h7" stroke="currentColor" stroke-width="${S}" stroke-linecap="round" />`,
);
export const ArrowShapeRightIcon = svgIcon(
  `<path d="M3 7.5h8v-2l6 4.5-6 4.5v-2H3Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);
export const ArrowShapeLeftIcon = svgIcon(
  `<path d="M17 12.5H9v2l-6-4.5 6-4.5v2h8Z" stroke="currentColor" stroke-width="${S}" stroke-linejoin="round" />`,
);

// ---------------------------------------------------------------------------
// Advanced tier: all 26 icon glyphs, each an insertable `type: "icon"` entry.
// ---------------------------------------------------------------------------

function advancedEntry(glyphId: IconGlyphId): ShapeCatalogEntry {
  const glyph = ICON_GLYPHS[glyphId];
  return {
    id: `adv-${glyphId}`,
    label: glyph.label,
    objectType: "icon",
    icon: glyphId,
    Icon: iconGlyphPreview(glyphId),
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const SHAPE_CATALOG: ShapeCatalogCategory[] = [
  {
    id: "basic",
    label: "Basic",
    entries: [
      { id: "basic-square", label: "Square", objectType: "container", Icon: SquareIcon },
      { id: "basic-ellipse", label: "Ellipse", objectType: "ellipse", Icon: EllipseIcon },
      { id: "basic-decision-diamond", label: "Decision", objectType: "decision", Icon: DiamondIcon },
      { id: "basic-triangle-up", label: "Triangle up", objectType: "triangle", direction: "up", Icon: TriangleUpIcon },
      { id: "basic-triangle-down", label: "Triangle down", objectType: "triangle", direction: "down", Icon: TriangleDownIcon },
      { id: "basic-rounded-rect", label: "Rounded rectangle", objectType: "process", Icon: RoundedRectIcon },
      { id: "basic-pentagon", label: "Pentagon", objectType: "pentagon", Icon: PentagonIcon },
      { id: "basic-octagon", label: "Octagon", objectType: "octagon", Icon: OctagonIcon },
      { id: "basic-plus", label: "Plus", objectType: "plus", Icon: PlusShapeIcon },
      { id: "basic-arrow-left", label: "Left arrow", objectType: "arrow-shape", direction: "left", Icon: ArrowShapeLeftIcon },
      { id: "basic-arrow-right", label: "Right arrow", objectType: "arrow-shape", direction: "right", Icon: ArrowShapeRightIcon },
      { id: "basic-chevron", label: "Chevron", objectType: "chevron", direction: "right", Icon: ChevronRightIcon },
      { id: "basic-star", label: "Star", objectType: "star", Icon: StarIcon },
      { id: "basic-chat", label: "Chat", objectType: "chat", Icon: SpeechBubbleIcon },
    ],
  },
  {
    id: "flowchart",
    label: "Flowchart",
    entries: [
      { id: "flow-parallelogram-right", label: "Parallelogram right", objectType: "parallelogram", direction: "right", Icon: ParallelogramRightIcon },
      { id: "flow-parallelogram-left", label: "Parallelogram left", objectType: "parallelogram", direction: "left", Icon: ParallelogramLeftIcon },
      { id: "flow-database", label: "Database", objectType: "database", Icon: DatabaseIcon },
      { id: "flow-cylinder-horizontal", label: "Cylinder (horizontal)", objectType: "cylinder-horizontal", Icon: CylinderHorizontalIcon },
      { id: "flow-page-corner", label: "Page corner", objectType: "page-corner", Icon: PageCornerIcon },
      { id: "flow-folder", label: "Folder", objectType: "folder", Icon: FolderIcon },
      { id: "flow-document", label: "Document", objectType: "document", Icon: DocumentIcon },
      { id: "flow-document-stack", label: "Document stack", objectType: "document-stack", Icon: DocumentStackIcon },
      { id: "flow-predefined-process", label: "Predefined process", objectType: "predefined-process", Icon: PredefinedProcessIcon },
      { id: "flow-off-page-connector", label: "Off-page connector", objectType: "off-page-connector", Icon: OffPageConnectorIcon },
      { id: "flow-trapezoid", label: "Trapezoid", objectType: "trapezoid", Icon: TrapezoidIcon },
      { id: "flow-manual-input", label: "Manual input", objectType: "manual-input", Icon: ManualInputIcon },
      { id: "flow-hexagon", label: "Hexagon", objectType: "hexagon", Icon: HexagonIcon },
      { id: "flow-internal-storage", label: "Internal storage", objectType: "internal-storage", Icon: InternalStorageIcon },
      { id: "flow-or-junction", label: "Or junction", objectType: "or-junction", Icon: OrJunctionIcon },
      { id: "flow-summing-junction", label: "Summing junction", objectType: "summing-junction", Icon: SummingJunctionIcon },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    entries: (Object.keys(ICON_GLYPHS) as IconGlyphId[]).map(advancedEntry),
  },
];

/** Flattened list of every entry across all categories, for search. */
export const SHAPE_CATALOG_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG.flatMap((c) => c.entries);

/** Panel A's compact "Search for a shape" set (ShapeSearchPopover) — technical/object glyphs for swapping an already-selected object's shape. Reuses a representative slice of the Advanced tier plus a few Basic/Flowchart entries, now that both are real schema types. */
export const SHAPE_SEARCH_ENTRIES: ShapeCatalogEntry[] = [
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-cpu"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "flow-database"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-display"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-mail"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "flow-document"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-code"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-bolt"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-terminal"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-person"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-globe"),
].filter((entry): entry is ShapeCatalogEntry => entry !== undefined);

/** Every entry in this catalog maps to a live schema type — there is no more "coming soon" disabled state (Wave C: all 19 W5 native types + "icon" are real). Kept as a function (not a boolean literal) so call sites don't need to change. */
export function isShapeEntryEnabled(_entry: ShapeCatalogEntry): boolean {
  return true;
}
