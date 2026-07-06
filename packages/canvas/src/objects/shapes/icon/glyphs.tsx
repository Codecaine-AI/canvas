"use client";

/**
 * Advanced-tier icon glyph registry for the `icon` object type (FigJam
 * parity — see docs/10-system-design/20-figjam-parity/doc.json "Missing
 * shape specs" row for `icon`).
 *
 * Each glyph is stroke-outline-only (fill="none"), drawn on a 24x24 grid,
 * round caps/joins, matching the FigJam/Nucleo Advanced icon set aesthetic
 * used elsewhere in this package (see chrome/toolbar-icons.tsx and
 * chrome/dock-icons.tsx for the sibling stroke-icon conventions — those are
 * 16px/18px chrome glyphs; these are the larger 24px canvas-object glyphs
 * rendered by IconShapeBody).
 *
 * Stroke width is NOT baked into the path data — callers apply
 * `strokeWidth={ICON_GLYPH_STROKE_WIDTH}` (mirrors ICON_STROKE_WIDTH_PX in
 * figjam-tokens.ts, which is tuned for the ~130px object size) so the glyph
 * scales cleanly if the viewBox is later re-projected into a differently
 * sized object.
 */

/** The 26 Advanced-tier glyph ids (exact enum from the parity brief). */
export const ICON_GLYPH_IDS = [
  "activity",
  "archive",
  "key",
  "chat",
  "cloud",
  "cpu",
  "database",
  "display",
  "mail",
  "file",
  "code",
  "bolt",
  "pin",
  "phone",
  "package",
  "coin",
  "shield",
  "send",
  "server",
  "cube",
  "gear",
  "drive",
  "terminal",
  "person",
  "wallet",
  "globe",
] as const;

export type IconGlyphId = (typeof ICON_GLYPH_IDS)[number];

/** Recommended default stroke width for a glyph drawn at the 24x24 viewBox. */
export const ICON_GLYPH_STROKE_WIDTH = 2;

export type IconGlyphDefinition = {
  /** Stable id — matches the `icon` field enum on an `icon`-type object. */
  id: IconGlyphId;
  /** Human-readable label shown in icon pickers (Wave C's ShapesPanel). */
  label: string;
  /** viewBox width/height — always 24 for this registry. */
  viewBoxSize: number;
  /**
   * One or more `<path>`/`<circle>`/`<line>` element descriptors making up
   * the glyph. Kept as plain data (not JSX) so the registry stays a pure,
   * serializable module — IconGlyph below is the component that turns this
   * into markup.
   */
  elements: readonly IconGlyphElement[];
};

export type IconGlyphElement =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

function path(d: string): IconGlyphElement {
  return { kind: "path", d };
}

function circle(cx: number, cy: number, r: number): IconGlyphElement {
  return { kind: "circle", cx, cy, r };
}

function line(x1: number, y1: number, x2: number, y2: number): IconGlyphElement {
  return { kind: "line", x1, y1, x2, y2 };
}

/**
 * Registry of glyph path data, keyed by id. Every glyph is a 24x24
 * stroke-outline silhouette — see the brief's per-glyph description for the
 * intended read (pulse line in a panel for `activity`, lidded box for
 * `archive`, etc).
 */
export const ICON_GLYPHS: Record<IconGlyphId, IconGlyphDefinition> = {
  activity: {
    id: "activity",
    label: "Activity",
    viewBoxSize: 24,
    elements: [
      path("M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z"),
      path("M6 13l3-4 2.5 3L15 7l3 6"),
    ],
  },
  archive: {
    id: "archive",
    label: "Archive",
    viewBoxSize: 24,
    elements: [
      path("M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V8H3Z"),
      path("M4 8h16v10.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z"),
      line(10, 12, 14, 12),
    ],
  },
  key: {
    id: "key",
    label: "Key",
    viewBoxSize: 24,
    elements: [
      circle(7.5, 16.5, 3.5),
      path("M9.9 14.1 18 6l2 2-1.6 1.6M17 8.5l1.8 1.8"),
    ],
  },
  chat: {
    id: "chat",
    label: "Chat",
    viewBoxSize: 24,
    elements: [
      path(
        "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H10l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z",
      ),
    ],
  },
  cloud: {
    id: "cloud",
    label: "Cloud",
    viewBoxSize: 24,
    elements: [
      path(
        "M7 17.5a4 4 0 0 1-.6-7.95 5 5 0 0 1 9.68-1.6A4.25 4.25 0 0 1 17.25 17.5Z",
      ),
    ],
  },
  cpu: {
    id: "cpu",
    label: "CPU",
    viewBoxSize: 24,
    elements: [
      path("M7.5 6.5A1 1 0 0 1 8.5 5.5h7a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1Z"),
      path("M11 9.5h2v5h-2z"),
      line(10, 2.5, 10, 5.5),
      line(14, 2.5, 14, 5.5),
      line(10, 18.5, 10, 21.5),
      line(14, 18.5, 14, 21.5),
      line(2.5, 10, 5.5, 10),
      line(2.5, 14, 5.5, 14),
      line(18.5, 10, 21.5, 10),
      line(18.5, 14, 21.5, 14),
    ],
  },
  database: {
    id: "database",
    label: "Database",
    viewBoxSize: 24,
    elements: [
      path("M4 6c0-1.4 3.6-2.5 8-2.5S20 4.6 20 6s-3.6 2.5-8 2.5S4 7.4 4 6Z"),
      path("M4 6v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6"),
      path("M4 12v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"),
    ],
  },
  display: {
    id: "display",
    label: "Display",
    viewBoxSize: 24,
    elements: [
      path("M3.5 4.5A1 1 0 0 1 4.5 3.5h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"),
      line(9, 20.5, 15, 20.5),
      line(12, 15.5, 12, 20.5),
    ],
  },
  mail: {
    id: "mail",
    label: "Mail",
    viewBoxSize: 24,
    elements: [
      path("M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"),
      path("M4.5 6.5 12 12.5l7.5-6"),
    ],
  },
  file: {
    id: "file",
    label: "File",
    viewBoxSize: 24,
    elements: [
      path("M6.5 3.5h7l4 4v12.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"),
      path("M13.5 3.5v4h4"),
      line(8.5, 13, 15.5, 13),
      line(8.5, 16.5, 15.5, 16.5),
    ],
  },
  code: {
    id: "code",
    label: "Code",
    viewBoxSize: 24,
    elements: [
      path("M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z"),
      path("M10.5 9 8 12l2.5 3"),
      path("M13.5 9 16 12l-2.5 3"),
    ],
  },
  bolt: {
    id: "bolt",
    label: "Bolt",
    viewBoxSize: 24,
    elements: [path("M13 2.5 5 14h5.5l-1.5 7.5L19 10h-5.5Z")],
  },
  pin: {
    id: "pin",
    label: "Pin",
    viewBoxSize: 24,
    elements: [
      path("M12 21.5S5 14.8 5 9.8a7 7 0 0 1 14 0c0 5-7 11.7-7 11.7Z"),
      circle(12, 9.5, 2.5),
    ],
  },
  phone: {
    id: "phone",
    label: "Phone",
    viewBoxSize: 24,
    elements: [
      path("M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5Z"),
      line(11, 18.5, 13, 18.5),
    ],
  },
  package: {
    id: "package",
    label: "Package",
    viewBoxSize: 24,
    elements: [
      path("M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z"),
      path("M3.5 8v9L12 21.5 20.5 17V8"),
      line(12, 12.5, 12, 21.5),
    ],
  },
  coin: {
    id: "coin",
    label: "Coin",
    viewBoxSize: 24,
    elements: [
      circle(12, 12, 8.5),
      path("M12 7.5v9M14.5 9.7c0-1-1-1.7-2.5-1.7-1.7 0-2.7.8-2.7 1.9 0 2.6 5.4 1.2 5.4 3.7 0 1.2-1.1 2-2.7 2-1.5 0-2.6-.7-2.6-1.8"),
    ],
  },
  shield: {
    id: "shield",
    label: "Shield",
    viewBoxSize: 24,
    elements: [
      path("M12 3 19 5.5V11c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5.5Z"),
      path("M9 12l2 2 4-4.5"),
    ],
  },
  send: {
    id: "send",
    label: "Send",
    viewBoxSize: 24,
    elements: [path("M20.5 3.5 3 10.2l6.5 2.8 2.8 6.5Z"), line(9.5, 13, 20.5, 3.5)],
  },
  server: {
    id: "server",
    label: "Server",
    viewBoxSize: 24,
    elements: [
      path("M4 4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5V9.5A1.5 1.5 0 0 1 18.5 11h-13A1.5 1.5 0 0 1 4 9.5Z"),
      path("M4 14.5A1.5 1.5 0 0 1 5.5 13h13A1.5 1.5 0 0 1 20 14.5V19.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5Z"),
      circle(7, 7, 0.6),
      circle(7, 17, 0.6),
    ],
  },
  cube: {
    id: "cube",
    label: "Cube",
    viewBoxSize: 24,
    elements: [
      path("M12 3 20 7.5v9L12 21 4 16.5v-9Z"),
      path("M4 7.5 12 12l8-4.5"),
      line(12, 12, 12, 21),
    ],
  },
  gear: {
    id: "gear",
    label: "Gear",
    viewBoxSize: 24,
    elements: [
      path(
        "M12 2.5v2.3M12 19.2v2.3M21.5 12h-2.3M4.8 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6",
      ),
      circle(12, 12, 5),
    ],
  },
  drive: {
    id: "drive",
    label: "Drive",
    viewBoxSize: 24,
    elements: [
      path("M3.5 15.5A1.5 1.5 0 0 1 5 14h14a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5Z"),
      circle(16.5, 17, 1),
    ],
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    viewBoxSize: 24,
    elements: [
      path("M3.5 5.5A1.5 1.5 0 0 1 5 4h14A1.5 1.5 0 0 1 20.5 5.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5Z"),
      path("M6.5 9 10 12l-3.5 3"),
      line(11.5, 15, 16.5, 15),
    ],
  },
  person: {
    id: "person",
    label: "Person",
    viewBoxSize: 24,
    elements: [circle(12, 8, 3.5), path("M4.5 20.5c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5")],
  },
  wallet: {
    id: "wallet",
    label: "Wallet",
    viewBoxSize: 24,
    elements: [
      path("M3.5 7.5A1.5 1.5 0 0 1 5 6h13a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 18H5a1.5 1.5 0 0 1-1.5-1.5Z"),
      path("M14.5 6 12 3.5H6A1.5 1.5 0 0 0 4.5 5v2.5"),
      circle(16, 12.2, 1.1),
    ],
  },
  globe: {
    id: "globe",
    label: "Globe",
    viewBoxSize: 24,
    elements: [
      circle(12, 12, 8.5),
      path("M3.5 12h17M12 3.5c2.5 2.3 4 5.3 4 8.5s-1.5 6.2-4 8.5c-2.5-2.3-4-5.3-4-8.5s1.5-6.2 4-8.5Z"),
    ],
  },
};
