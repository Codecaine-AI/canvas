"use client";

import { CANVAS_ICON_GLYPHS, type CanvasIconGlyph } from "../../../state/schema/object-types";
import { BRAND_ICON_GLYPH_ELEMENTS } from "./icon-glyph-data-brands.generated";
import { TABLER_ICON_GLYPH_ELEMENTS } from "./icon-glyph-data-tabler.generated";
import { GENERATED_ICON_GLYPH_ELEMENTS } from "./icon-glyph-data.generated";

/**
 * Icon glyph registry for the `icon` object type (FigJam parity — see
 * docs/10-system-design/20-figjam-parity/doc.json "Missing shape specs" row
 * for `icon`) and for section header icons.
 *
 * The geometry is GENERATED from three corpora; this module keeps the
 * hand-authored labels and categories, the typed registry shape, and the pack
 * rules, and joins them onto the generated geometry:
 *   - Nucleo (./icon-glyph-data.generated — the licensed Nucleo sources +
 *     ui/icons/manifest.json via tools/nucleo-icons/generate.ts): the original
 *     30 operational-map glyphs on the 18-unit grid, stroke-outline, round
 *     caps/joins, matching the FigJam/Nucleo Advanced aesthetic of the trim
 *     icons in ui/icons/nucleo/.
 *   - Tabler (./icon-glyph-data-tabler.generated — the vendored @tabler/icons
 *     outline SVGs via tools/dev-icons/generate.ts): every generic id on the
 *     24-unit grid, stroke-outline, round caps/joins.
 *   - Simple Icons (./icon-glyph-data-brands.generated — same tool): the
 *     `brand-*` logos on the 24-unit grid, FILLED silhouettes.
 * It lives HERE, beside the icon object def, because these glyphs are canvas
 * CONTENT (what an `icon` object draws), not interface icons (co-location
 * alignment).
 *
 * Packs (the theme's `iconPack`): `nucleo` draws the Nucleo glyph where one
 * exists and the Tabler glyph otherwise; `tabler` draws Tabler for every
 * generic id. Brand ids draw their Simple Icons logo in both packs.
 * `resolveIconGlyph(id, pack)` is the theme-aware entry point; `ICON_GLYPHS`
 * stays the nucleo pack, which is what the default theme draws.
 *
 * Stroke width is NOT baked into the path data — callers apply stroke width
 * in viewBox units. Every renderer derives it via
 * `iconGlyphStrokeWidthForSize()` (18-unit Nucleo grid) or
 * `iconGlyphStrokeWidthForViewBox()` (any grid, same rendered weight):
 * on-canvas glyphs pass their object size, and the picker previews pass the
 * icon default placed size — so a preview is a faithful miniature of the icon
 * a click will draw. Fill-paint (brand) glyphs take no stroke.
 */

/**
 * Every glyph id, in roster order: the schema's CANVAS_ICON_GLYPHS (the single
 * source of truth) — the 30 operational-map ids first, then the generic
 * additions, then the `brand-*` logos.
 */
export const ICON_GLYPH_IDS: typeof CANVAS_ICON_GLYPHS = CANVAS_ICON_GLYPHS;

export type IconGlyphId = CanvasIconGlyph;

/** A `brand-*` id: always the Simple Icons logo, fill paint. */
export type BrandIconGlyphId = Extract<IconGlyphId, `brand-${string}`>;

/** A generic (non-brand) id: the pack's outline glyph, stroke paint. */
export type GenericIconGlyphId = Exclude<IconGlyphId, BrandIconGlyphId>;

/** The theme-selectable glyph corpora (`CanvasStyle.iconPack`). */
export const ICON_PACK_IDS = ["nucleo", "tabler"] as const;

export type IconPackId = (typeof ICON_PACK_IDS)[number];

/** Which corpus a resolved glyph's geometry came from. */
export type IconGlyphSource = "nucleo" | "tabler" | "simple-icons";

/**
 * How a glyph is painted. `stroke`: outline — fill="none", round caps/joins,
 * stroke width from the helpers below. `fill`: solid silhouette — filled with
 * the glyph color, no stroke.
 */
export type IconGlyphPaint = "stroke" | "fill";

/** Picker / agent-guidance groups, in display order. */
export const ICON_GLYPH_CATEGORIES = [
  { id: "agents", label: "Agents & AI" },
  { id: "compute", label: "Compute" },
  { id: "data", label: "Data" },
  { id: "network", label: "Network" },
  { id: "dev", label: "Dev" },
  { id: "people", label: "People" },
  { id: "docs", label: "Docs" },
  { id: "status", label: "Status & control" },
  { id: "brands", label: "Brands" },
] as const;

export type IconGlyphCategory = (typeof ICON_GLYPH_CATEGORIES)[number]["id"];

/**
 * Recommended default stroke width, in viewBox units, for a glyph drawn at its
 * native (18x18 Nucleo) viewBox. 1/18 is a deliberately lighter weight than
 * Nucleo's native 1/12. No renderer draws with this constant anymore (the
 * picker previews now stroke with `iconGlyphStrokeWidthForSize()` at the icon
 * default placed size, same as on-canvas); it remains the documented
 * reference weight the canvas stroke is tuned against.
 */
export const ICON_GLYPH_STROKE_WIDTH = 1.0;

export const ICON_GLYPH_REFERENCE_SIZE_PX = 130;

/**
 * Base stroke width (viewBox units) for ON-CANVAS glyphs at the 130px
 * reference size — deliberately lighter than ICON_GLYPH_STROKE_WIDTH, which
 * the small panel/search previews keep for legibility at ~20px.
 */
export const ICON_GLYPH_CANVAS_STROKE_WIDTH = 0.65;

/**
 * Exponent for how strongly glyph stroke width compensates for object size.
 * 0 = constant viewBox stroke (rendered weight grows linearly with size,
 * comically thick when large); 1 = constant rendered pixel weight at every
 * size. Full compensation: every icon draws with the 130px-reference line
 * weight regardless of how large it is scaled.
 */
const ICON_GLYPH_STROKE_FALLOFF = 1;

/**
 * Returns the on-canvas glyph stroke width in viewBox units for an icon whose
 * rendered SVG scale is based on `sizePx` (the smaller object dimension).
 * A constant viewBox stroke makes rendered pixel weight scale linearly with
 * object size; this falloff keeps the 130px reference identical to today's
 * look while letting larger icons get heavier only slightly.
 */
export function iconGlyphStrokeWidthForSize(sizePx: number): number {
  if (sizePx <= 0) {
    return ICON_GLYPH_CANVAS_STROKE_WIDTH;
  }
  return ICON_GLYPH_CANVAS_STROKE_WIDTH * (ICON_GLYPH_REFERENCE_SIZE_PX / sizePx) ** ICON_GLYPH_STROKE_FALLOFF;
}

/** The grid every stroke constant above is tuned on: Nucleo's 18-unit viewBox. */
export const ICON_GLYPH_BASE_VIEWBOX_SIZE = 18;

/**
 * `iconGlyphStrokeWidthForSize()` for any glyph grid: the stroke, in the
 * glyph's OWN viewBox units, that renders at the same pixel weight a Nucleo
 * glyph drawn in the same box gets.
 *
 * Drawn into a box B px wide, one viewBox unit of a V-unit glyph spans B / V
 * px, so a stroke of w units renders w·B/V px. Holding that equal to the
 * Nucleo weight w₁₈·B/18 gives
 *
 *     w(V) = iconGlyphStrokeWidthForSize(sizePx) · V / 18
 *
 * — a 24-unit Tabler glyph strokes 24/18 ≈ 1.33× the Nucleo width in its own
 * units, and V = 18 returns iconGlyphStrokeWidthForSize(sizePx) bit-for-bit
 * (the grid ratio is taken first, so it is exactly 1). `sizePx` is the box the
 * glyph is drawn into (on canvas, the smaller object dimension). A
 * non-positive `viewBoxSize` is treated as the Nucleo grid.
 */
export function iconGlyphStrokeWidthForViewBox(sizePx: number, viewBoxSize: number): number {
  const nucleoWidth = iconGlyphStrokeWidthForSize(sizePx);
  return viewBoxSize > 0 ? nucleoWidth * (viewBoxSize / ICON_GLYPH_BASE_VIEWBOX_SIZE) : nucleoWidth;
}

export type IconGlyphDefinition = {
  /** Stable id — matches the `icon` field enum on an `icon`-type object. */
  id: IconGlyphId;
  /** Human-readable label shown in icon pickers (Wave C's ShapesPanel). */
  label: string;
  /** Picker / guidance group — one of ICON_GLYPH_CATEGORIES. */
  category: IconGlyphCategory;
  /** The corpus this geometry came from. */
  source: IconGlyphSource;
  /** Outline (`stroke`) or solid silhouette (`fill`). */
  paint: IconGlyphPaint;
  /** viewBox width/height — 18 for Nucleo glyphs, 24 for Tabler and Simple Icons. */
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

/** Picker label + group per generic id — the hand-authored half of a glyph. */
const GENERIC_GLYPH_META: Record<
  GenericIconGlyphId,
  { label: string; category: Exclude<IconGlyphCategory, "brands"> }
> = {
  agent: { label: "Agent", category: "agents" },
  model: { label: "Model", category: "agents" },
  human: { label: "Human", category: "people" },
  orchestrator: { label: "Orchestrator", category: "agents" },
  memory: { label: "Memory", category: "data" },
  knowledge: { label: "Knowledge", category: "data" },
  queue: { label: "Queue", category: "data" },
  server: { label: "Server", category: "compute" },
  terminal: { label: "Terminal", category: "dev" },
  config: { label: "Config", category: "dev" },
  api: { label: "API", category: "network" },
  message: { label: "Message", category: "people" },
  send: { label: "Send", category: "network" },
  event: { label: "Event", category: "status" },
  guardrail: { label: "Guardrail", category: "status" },
  monitor: { label: "Monitor", category: "status" },
  judge: { label: "Judge", category: "agents" },
  document: { label: "Document", category: "docs" },
  documents: { label: "Documents", category: "docs" },
  activity: { label: "Activity", category: "status" },
  archive: { label: "Archive", category: "data" },
  key: { label: "Key", category: "status" },
  coin: { label: "Coin", category: "status" },
  package: { label: "Package", category: "dev" },
  voice: { label: "Voice", category: "people" },
  search: { label: "Search", category: "data" },
  tool: { label: "Tool", category: "agents" },
  wait: { label: "Wait", category: "status" },
  lock: { label: "Lock", category: "status" },
  eval: { label: "Eval", category: "agents" },
  database: { label: "Database", category: "data" },
  brain: { label: "Brain", category: "agents" },
  function: { label: "Function", category: "compute" },
  container: { label: "Container", category: "compute" },
  cloud: { label: "Cloud", category: "compute" },
  network: { label: "Network", category: "network" },
  globe: { label: "Globe", category: "network" },
  webhook: { label: "Webhook", category: "network" },
  branch: { label: "Branch", category: "dev" },
  "pull-request": { label: "Pull request", category: "dev" },
  merge: { label: "Merge", category: "dev" },
  commit: { label: "Commit", category: "dev" },
  cache: { label: "Cache", category: "data" },
  schedule: { label: "Schedule", category: "status" },
  "code-file": { label: "Code file", category: "docs" },
  folder: { label: "Folder", category: "docs" },
  users: { label: "Users", category: "people" },
  browser: { label: "Browser", category: "compute" },
  desktop: { label: "Desktop", category: "compute" },
  laptop: { label: "Laptop", category: "compute" },
  mobile: { label: "Mobile", category: "compute" },
  plug: { label: "Plug", category: "network" },
  dashboard: { label: "Dashboard", category: "status" },
  chart: { label: "Chart", category: "status" },
  gauge: { label: "Gauge", category: "status" },
  bell: { label: "Bell", category: "status" },
  mail: { label: "Mail", category: "people" },
  loop: { label: "Loop", category: "status" },
  code: { label: "Code", category: "dev" },
  bug: { label: "Bug", category: "dev" },
  cpu: { label: "CPU", category: "compute" },
  layers: { label: "Layers", category: "compute" },
  table: { label: "Table", category: "data" },
  link: { label: "Link", category: "network" },
  route: { label: "Route", category: "network" },
  filter: { label: "Filter", category: "data" },
};

/** Picker label per brand id — the product's own name. Every brand groups under "brands". */
const BRAND_GLYPH_LABELS: Record<BrandIconGlyphId, string> = {
  "brand-postgres": "PostgreSQL",
  "brand-sqlite": "SQLite",
  "brand-redis": "Redis",
  "brand-mongodb": "MongoDB",
  "brand-docker": "Docker",
  "brand-kubernetes": "Kubernetes",
  "brand-github": "GitHub",
  "brand-git": "Git",
  "brand-anthropic": "Anthropic",
  "brand-claude": "Claude",
  "brand-huggingface": "Hugging Face",
  "brand-ollama": "Ollama",
  "brand-bun": "Bun",
  "brand-node": "Node.js",
  "brand-typescript": "TypeScript",
  "brand-python": "Python",
  "brand-go": "Go",
  "brand-rust": "Rust",
  "brand-react": "React",
  "brand-nextjs": "Next.js",
  "brand-vite": "Vite",
  "brand-electron": "Electron",
  "brand-vercel": "Vercel",
  "brand-cloudflare": "Cloudflare",
  "brand-supabase": "Supabase",
  "brand-terraform": "Terraform",
  "brand-kafka": "Kafka",
  "brand-linear": "Linear",
  "brand-figma": "Figma",
};

type GeneratedGlyph = { viewBoxSize: number; elements: readonly IconGlyphElement[] };

function isBrandIconGlyphId(id: IconGlyphId): id is BrandIconGlyphId {
  return id.startsWith("brand-");
}

/**
 * The generated geometry for `id`. Exhaustiveness guarantee: every id in
 * ICON_GLYPH_IDS must have Tabler (generic) or Simple Icons (brand) geometry.
 * Throws at module init (i.e. at build/test time for anything that touches
 * the registry) so a stale *.generated.ts is caught immediately.
 */
function generatedGlyph(table: Record<string, GeneratedGlyph>, id: IconGlyphId): GeneratedGlyph {
  const generated = table[id];
  if (!generated) {
    throw new Error(
      `icon-glyphs: no generated glyph data for "${id}" — add it to tools/dev-icons/manifest.json and re-run \`bun tools/dev-icons/generate.ts\``,
    );
  }
  return generated;
}

function glyphDefinition(id: IconGlyphId, source: IconGlyphSource, generated: GeneratedGlyph): IconGlyphDefinition {
  let label: string;
  let category: IconGlyphCategory;
  if (isBrandIconGlyphId(id)) {
    label = BRAND_GLYPH_LABELS[id];
    category = "brands";
  } else {
    ({ label, category } = GENERIC_GLYPH_META[id]);
  }
  return {
    id,
    label,
    category,
    source,
    paint: source === "simple-icons" ? "fill" : "stroke",
    viewBoxSize: generated.viewBoxSize,
    elements: generated.elements,
  };
}

function buildPack(pick: (id: IconGlyphId) => IconGlyphDefinition): Record<IconGlyphId, IconGlyphDefinition> {
  const registry = {} as Record<IconGlyphId, IconGlyphDefinition>;
  for (const id of ICON_GLYPH_IDS) {
    registry[id] = pick(id);
  }
  return registry;
}

/** The `tabler` pack: Tabler for every generic id, Simple Icons for brands. */
const TABLER_PACK = buildPack((id) =>
  isBrandIconGlyphId(id)
    ? glyphDefinition(id, "simple-icons", generatedGlyph(BRAND_ICON_GLYPH_ELEMENTS, id))
    : glyphDefinition(id, "tabler", generatedGlyph(TABLER_ICON_GLYPH_ELEMENTS, id)),
);

/** The `nucleo` pack: the Nucleo glyph where one exists, else the tabler pack's definition. */
const NUCLEO_PACK = buildPack((id) => {
  const nucleo = isBrandIconGlyphId(id) ? undefined : GENERATED_ICON_GLYPH_ELEMENTS[id];
  return nucleo ? glyphDefinition(id, "nucleo", nucleo) : TABLER_PACK[id];
});

/**
 * The glyph `id` draws in `pack` (the theme's `iconPack`). A roster id always
 * resolves; a loose string (an unvalidated document field) resolves to
 * undefined unless it is a roster id. Any pack other than `tabler` resolves
 * as `nucleo`, the default theme's pack.
 */
export function resolveIconGlyph(id: CanvasIconGlyph, pack: IconPackId): IconGlyphDefinition;
export function resolveIconGlyph(id: string | undefined, pack: IconPackId): IconGlyphDefinition | undefined;
export function resolveIconGlyph(id: string | undefined, pack: IconPackId): IconGlyphDefinition | undefined {
  if (id === undefined) return undefined;
  const registry = pack === "tabler" ? TABLER_PACK : NUCLEO_PACK;
  return Object.hasOwn(registry, id) ? registry[id as IconGlyphId] : undefined;
}

/**
 * Registry of glyph data, keyed by id — the `nucleo` pack, i.e. what the
 * default theme draws. The 30 operational-map glyphs keep their Nucleo
 * geometry (see the parity brief's per-glyph description for the intended
 * read: pulse line in a panel for `activity`, lidded box for `archive`,
 * etc); newer generic ids fall back to Tabler and brands to Simple Icons.
 * Theme-aware renderers use resolveIconGlyph(id, style.iconPack) instead.
 */
export const ICON_GLYPHS: Record<IconGlyphId, IconGlyphDefinition> = NUCLEO_PACK;
