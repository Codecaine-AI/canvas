"use client";

import { GENERATED_ICON_GLYPH_ELEMENTS } from "./icon-glyph-data.generated";

/**
 * Advanced-tier icon glyph registry for the `icon` object type (FigJam
 * parity — see docs/10-system-design/20-figjam-parity/doc.json "Missing
 * shape specs" row for `icon`).
 *
 * Each glyph is stroke-outline-only (fill="none"), round caps/joins,
 * matching the FigJam/Nucleo Advanced icon set aesthetic used by the chrome
 * icons in this folder (ui/icons/nucleo/). Since the Nucleo consolidation the
 * path data is GENERATED from the licensed Nucleo sources (the vendored Nucleo
 * SVGs + manifest.json via tools/nucleo-icons/generate.ts) into
 * ./icon-glyph-data.generated — this module keeps the stable id vocabulary,
 * human-readable labels, and the typed registry shape, and joins them onto
 * the generated geometry.
 *
 * Stroke width is NOT baked into the path data — callers apply
 * `strokeWidth={ICON_GLYPH_STROKE_WIDTH}` (mirrors ICON_STROKE_WIDTH_PX in
 * theme/tokens.ts, which is tuned for the ~130px object size) so the glyph
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

/**
 * Recommended default stroke width for a glyph drawn at its native (18x18
 * Nucleo) viewBox. 1.5/18 is the same stroke-to-grid ratio as the previous
 * hand-drawn registry's 2/24 (both 1/12 — Nucleo's native weight), so the
 * rendered glyph weight is unchanged.
 */
export const ICON_GLYPH_STROKE_WIDTH = 1.5;

export type IconGlyphDefinition = {
  /** Stable id — matches the `icon` field enum on an `icon`-type object. */
  id: IconGlyphId;
  /** Human-readable label shown in icon pickers (Wave C's ShapesPanel). */
  label: string;
  /** viewBox width/height — the generated Nucleo grid (18 for this registry). */
  viewBoxSize: number;
  /**
   * One or more `<path>`/`<circle>`/`<line>` element descriptors making up
   * the glyph. Kept as plain data (not JSX) so the registry stays a pure,
   * serializable module — IconShapeBody turns this into markup.
   */
  elements: readonly IconGlyphElement[];
};

export type IconGlyphElement =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

/** Picker labels, keyed by id — the one piece of glyph data that stays hand-authored. */
const ICON_GLYPH_LABELS: Record<IconGlyphId, string> = {
  activity: "Activity",
  archive: "Archive",
  key: "Key",
  chat: "Chat",
  cloud: "Cloud",
  cpu: "CPU",
  database: "Database",
  display: "Display",
  mail: "Mail",
  file: "File",
  code: "Code",
  bolt: "Bolt",
  pin: "Pin",
  phone: "Phone",
  package: "Package",
  coin: "Coin",
  shield: "Shield",
  send: "Send",
  server: "Server",
  cube: "Cube",
  gear: "Gear",
  drive: "Drive",
  terminal: "Terminal",
  person: "Person",
  wallet: "Wallet",
  globe: "Globe",
};

function buildGlyphRegistry(): Record<IconGlyphId, IconGlyphDefinition> {
  const registry = {} as Record<IconGlyphId, IconGlyphDefinition>;

  for (const id of ICON_GLYPH_IDS) {
    const generated = GENERATED_ICON_GLYPH_ELEMENTS[id];

    // Exhaustiveness guarantee: every id in ICON_GLYPH_IDS must have generated
    // geometry. Throws at module init (i.e. at build/test time for anything
    // that touches the registry) so a stale icon-glyph-data.generated.ts is
    // caught immediately — fix by editing manifest.json and re-running the
    // tools/nucleo-icons/generate.ts.
    if (!generated) {
      throw new Error(
        `icon-glyphs: no generated glyph data for "${id}" — edit manifest.json and re-run \`bun tools/nucleo-icons/generate.ts\``,
      );
    }

    registry[id] = {
      id,
      label: ICON_GLYPH_LABELS[id],
      viewBoxSize: generated.viewBoxSize,
      elements: generated.elements,
    };
  }

  return registry;
}

/**
 * Registry of glyph data, keyed by id. Every glyph is a stroke-outline
 * silhouette on the generated Nucleo grid — see the parity brief's per-glyph
 * description for the intended read (pulse line in a panel for `activity`,
 * lidded box for `archive`, etc).
 */
export const ICON_GLYPHS: Record<IconGlyphId, IconGlyphDefinition> = buildGlyphRegistry();
