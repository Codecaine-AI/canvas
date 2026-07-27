import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";
import type {
  CanvasArrowDirection,
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

// Relative imports keep the session harness away from the canvas React surface.
import { ICON_GLYPH_IDS } from "../../../../canvas/src/objects/shapes/icon/icon-glyphs";
import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg";
import {
  draftPlacedObject,
  OBJECT_TYPE_DEFAULTS,
} from "../../../../canvas/src/state/schema/object-defaults";

import { rasterizeSvgToPng } from "../render";

type Family =
  | "containers"
  | "flowchart"
  | "geometric"
  | "notes"
  | "special"
  | "other";

/**
 * Known families are intentionally a partial map. New schema types land in
 * "other" automatically, while the roster itself always comes from the live
 * defaults table.
 */
const FAMILY: Partial<Record<InteractiveCanvasObjectType, Family>> = {
  section: "containers",
  process: "flowchart",
  decision: "flowchart",
  document: "flowchart",
  database: "flowchart",
  "document-stack": "flowchart",
  "predefined-process": "flowchart",
  "off-page-connector": "flowchart",
  "manual-input": "flowchart",
  "internal-storage": "flowchart",
  "or-junction": "flowchart",
  "summing-junction": "flowchart",
  "cylinder-horizontal": "flowchart",
  "page-corner": "flowchart",
  rectangle: "geometric",
  ellipse: "geometric",
  triangle: "geometric",
  parallelogram: "geometric",
  pentagon: "geometric",
  hexagon: "geometric",
  octagon: "geometric",
  star: "geometric",
  plus: "geometric",
  chevron: "geometric",
  trapezoid: "geometric",
  pill: "geometric",
  "arrow-shape": "geometric",
  folder: "geometric",
  sticky: "notes",
  icon: "special",
};

const FAMILY_ORDER: readonly Family[] = [
  "containers",
  "flowchart",
  "geometric",
  "notes",
  "special",
  "other",
];

const VIEW_WIDTH = 1400;
const COLUMNS = 4;
const FAMILY_LABEL_WIDTH = 180;
const FAMILY_LABEL_HEIGHT = 56;
const CONTENT_X = 232;
const CELL_GAP_X = 48;
const SPECIMEN_LABEL_HEIGHT = 34;
const SPECIMEN_LABEL_GAP_Y = 10;
const ROW_GAP_Y = 52;
const BAND_GAP_Y = 72;

const ICON_COLUMNS = 8;
const COLOR_COLUMNS = 5;
const COLOR_SWATCH = { width: 150, height: 72 } as const;
const DEMO_NODE = { width: 130, height: 48 } as const;
const DEMO_SPAN = 320;
const DEMO_COLUMN_WIDTH = 560;
const DEMO_ROW_HEIGHT = 110;

/**
 * Every arrow kind gets a demo wire; the Record is keyed by the schema union
 * so a new arrow kind cannot ship without a specimen.
 */
const ARROW_DEMOS: Record<CanvasArrowDirection, true> = {
  forward: true, back: true, both: true, none: true,
};

/** undefined = not yet attempted; null = unrenderable; Buffer = cached. */
let sheetCache: Buffer | null | undefined;

function positiveDefaultSize(type: InteractiveCanvasObjectType): {
  width: number;
  height: number;
} {
  const { width, height } = OBJECT_TYPE_DEFAULTS[type].geometry;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid default geometry for object type ${type}.`);
  }
  return { width, height };
}

function buildVocabularyDocument(): InteractiveCanvasDocument {
  const roster = Object.keys(OBJECT_TYPE_DEFAULTS) as InteractiveCanvasObjectType[];
  const grouped = new Map<Family, InteractiveCanvasObjectType[]>(
    FAMILY_ORDER.map((family) => [family, []]),
  );
  for (const type of roster) {
    grouped.get(FAMILY[type] ?? "other")!.push(type);
  }

  const objects: InteractiveCanvasDocument["objects"] = [];
  const flowchartSpecimenIds: string[] = [];
  let nextBandY = 0;

  for (const family of FAMILY_ORDER) {
    const types = grouped.get(family)!;
    if (types.length === 0) continue;

    const sizes = types.map(positiveDefaultSize);
    const labelWidths = types.map((type) => Math.max(132, type.length * 10 + 48));
    const maxWidth = Math.max(...sizes.map(({ width }) => width));
    const maxHeight = Math.max(...sizes.map(({ height }) => height));
    const cellWidth = Math.max(
      maxWidth + CELL_GAP_X,
      Math.max(...labelWidths) + 8,
    );
    const cellHeight =
      maxHeight + SPECIMEN_LABEL_GAP_Y + SPECIMEN_LABEL_HEIGHT + ROW_GAP_Y;

    objects.push(
      draftPlacedObject(
        "pill",
        {
          x: 0,
          y: nextBandY,
          width: FAMILY_LABEL_WIDTH,
          height: FAMILY_LABEL_HEIGHT,
        },
        {
          id: `family-${family}`,
          text: family.toUpperCase(),
          color: "blue",
        },
      ),
    );

    for (const [index, type] of types.entries()) {
      const { width, height } = sizes[index]!;
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const id = `vocabulary-${type}`;
      const geometry = {
        x: CONTENT_X + column * cellWidth + (cellWidth - width) / 2,
        y: nextBandY + row * cellHeight,
        width,
        height,
      };
      const text = type === "sticky"
        ? `**${type}**\n- markdown\n- supported`
        : type;

      objects.push(
        draftPlacedObject(type, geometry, {
          id,
          text,
          ...(type === "icon" ? { icon: ICON_GLYPH_IDS[0] } : {}),
        }),
      );
      // A separate, label-styled pill keeps glyph-only and very small shapes
      // identifiable without maintaining another list of renderer exceptions.
      const labelWidth = labelWidths[index]!;
      objects.push(
        draftPlacedObject(
          "pill",
          {
            x: geometry.x + (width - labelWidth) / 2,
            y: geometry.y + height + SPECIMEN_LABEL_GAP_Y,
            width: labelWidth,
            height: SPECIMEN_LABEL_HEIGHT,
          },
          {
            id: `label-${type}`,
            text: type,
            color: "white",
          },
        ),
      );
      if (family === "flowchart" && flowchartSpecimenIds.length < 2) {
        flowchartSpecimenIds.push(id);
      }
    }

    nextBandY += Math.ceil(types.length / COLUMNS) * cellHeight + BAND_GAP_Y;
  }

  const connections: InteractiveCanvasDocument["connections"] =
    flowchartSpecimenIds.length === 2
      ? [
          {
            id: "vocabulary-connection",
            from: { objectId: flowchartSpecimenIds[0]!, anchor: "right" },
            to: { objectId: flowchartSpecimenIds[1]!, anchor: "left" },
            arrow: "forward",
            label: "connects",
          },
        ]
      : [];

  const bandLabel = (id: string, text: string): void => {
    objects.push(
      draftPlacedObject(
        "pill",
        { x: 0, y: nextBandY, width: FAMILY_LABEL_WIDTH, height: FAMILY_LABEL_HEIGHT },
        { id, text, color: "blue" },
      ),
    );
  };

  // ICONS — every glyph in the roster, its id rendered as the built-in caption.
  bandLabel("band-icons", "ICONS");
  const iconSize = positiveDefaultSize("icon");
  const iconCellWidth = iconSize.width + CELL_GAP_X;
  const iconCellHeight = iconSize.height + SPECIMEN_LABEL_HEIGHT + ROW_GAP_Y;
  for (const [index, glyph] of ICON_GLYPH_IDS.entries()) {
    objects.push(
      draftPlacedObject(
        "icon",
        {
          x: CONTENT_X + (index % ICON_COLUMNS) * iconCellWidth,
          y: nextBandY + Math.floor(index / ICON_COLUMNS) * iconCellHeight,
          width: iconSize.width,
          height: iconSize.height,
        },
        { id: `glyph-${glyph}`, text: glyph, icon: glyph },
      ),
    );
  }
  nextBandY += Math.ceil(ICON_GLYPH_IDS.length / ICON_COLUMNS) * iconCellHeight + BAND_GAP_Y;

  // COLORS — every roster color as a labeled swatch.
  bandLabel("band-colors", "COLORS");
  const colorCellWidth = COLOR_SWATCH.width + CELL_GAP_X;
  const colorCellHeight = COLOR_SWATCH.height + ROW_GAP_Y;
  for (const [index, color] of CANVAS_COLORS.entries()) {
    objects.push(
      draftPlacedObject(
        "rectangle",
        {
          x: CONTENT_X + (index % COLOR_COLUMNS) * colorCellWidth,
          y: nextBandY + Math.floor(index / COLOR_COLUMNS) * colorCellHeight,
          ...COLOR_SWATCH,
        },
        { id: `color-${color}`, text: color, color },
      ),
    );
  }
  nextBandY += Math.ceil(CANVAS_COLORS.length / COLOR_COLUMNS) * colorCellHeight + BAND_GAP_Y;

  // CONNECTIONS — a labeled demo wire per arrow kind, one dashed, one to a
  // section: everything a wire can look like and attach to.
  bandLabel("band-connections", "CONNECTIONS");
  const demoLabels: string[] = [
    ...(Object.keys(ARROW_DEMOS) as CanvasArrowDirection[]).map((arrow) => `arrow ${arrow}`),
    "dashed",
    "to a section",
  ];
  for (const [index, label] of demoLabels.entries()) {
    const x = CONTENT_X + (index % 2) * DEMO_COLUMN_WIDTH;
    const y = nextBandY + Math.floor(index / 2) * DEMO_ROW_HEIGHT;
    const fromId = `demo-from-${index}`;
    const toId = `demo-to-${index}`;
    objects.push(
      draftPlacedObject(
        "pill",
        { x, y, ...DEMO_NODE },
        { id: fromId, text: "", color: "white" },
      ),
    );
    if (label === "to a section") {
      objects.push(
        draftPlacedObject(
          "section",
          { x: x + DEMO_SPAN, y: y - 24, width: 200, height: DEMO_NODE.height + 48 },
          { id: toId, text: "section" },
        ),
      );
    } else {
      objects.push(
        draftPlacedObject(
          "pill",
          { x: x + DEMO_SPAN, y, ...DEMO_NODE },
          { id: toId, text: "", color: "white" },
        ),
      );
    }
    connections.push({
      id: `demo-wire-${index}`,
      from: { objectId: fromId, anchor: "right" },
      to: { objectId: toId, anchor: "left" },
      arrow: label.startsWith("arrow ")
        ? (label.slice("arrow ".length) as CanvasArrowDirection)
        : "forward",
      ...(label === "dashed" ? { style: "dashed" as const } : {}),
      label,
    });
  }

  return {
    schemaVersion: 1,
    id: "object-vocabulary-contact-sheet",
    title: "Object vocabulary",
    mode: "diagram",
    objects,
    connections,
  };
}

/**
 * The full board vocabulary rendered as labeled specimens: every object type
 * grouped by family, every icon glyph, every roster color, and a demo wire
 * per connection arrow kind plus dashed style and a section endpoint.
 * Returns null — never throws — when construction or rendering fails, and
 * caches that result for the life of the process.
 */
export function vocabularyContactSheet(): Buffer | null {
  if (sheetCache !== undefined) return sheetCache;
  try {
    const document = buildVocabularyDocument();
    const rendered = renderDocumentToSvg(document, {
      fit: "content",
      padding: 24,
      width: VIEW_WIDTH,
    });
    sheetCache = rasterizeSvgToPng(rendered.svg).png;
  } catch {
    sheetCache = null;
  }
  return sheetCache;
}
