/**
 * Font embedding for standalone static SVGs.
 *
 * An SVG shown as an image (an <img>, a PNG export's Image decode, a file
 * opened on its own) is its own document: the page's @font-face rules never
 * reach it, so its text paints in whatever fonts the machine has — not the
 * bundled faces every width in it was measured with (theme/text-measure.ts).
 * `embedSvgFonts` puts the faces an SVG uses into it as @font-face rules with
 * data: URLs, which image documents do load.
 *
 * The bytes come from the host (`loadFace`): the browser export fetches the
 * woff2 files (render/download.ts), the Studio server reads them from disk.
 * Pure and Node-safe.
 */

import { BUNDLED_FACES, type BundledFace } from "@codecaine-ai/text-measure";

/** The bundled family a font-family list paints in first (the canvas stacks name one). */
function bundledFamily(familyList: string): BundledFace["family"] | null {
  const first = familyList.split(",")[0]!.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (first === "inter") return "Inter";
  if (first === "ibm plex mono") return "IBM Plex Mono";
  return null;
}

/**
 * The bundled face CSS font matching paints `weight` with (CSS Fonts 4
 * §5.2: 400–500 look up to 500, then down, then up; below 400 down then up;
 * above 500 up then down).
 */
export function bundledFaceFor(family: BundledFace["family"], weight: number): BundledFace {
  const faces = BUNDLED_FACES.filter((face) => face.family === family);
  const exact = faces.find((face) => face.weight === weight);
  if (exact) return exact;
  const below = faces.filter((face) => face.weight < weight).sort((a, b) => b.weight - a.weight);
  const above = faces.filter((face) => face.weight > weight).sort((a, b) => a.weight - b.weight);
  if (weight >= 400 && weight <= 500) {
    return above.find((face) => face.weight <= 500) ?? below[0] ?? above[0]!;
  }
  if (weight < 400) return below[0] ?? above[0]!;
  return above[0] ?? below[0]!;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&") : undefined;
}

function weightOf(value: string | undefined, inherited: number): number {
  if (value === undefined) return inherited;
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  const number = Number(value);
  return Number.isFinite(number) ? number : inherited;
}

/**
 * The bundled faces the text of `svg` paints with, in BUNDLED_FACES order:
 * every <text>/<tspan> with characters, its font-family and font-weight
 * resolved through the elements around it (the root sets the family).
 */
export function svgFontFaces(svg: string): BundledFace[] {
  const used = new Set<string>();
  const stack: Array<{ family: string; weight: number; tag: string }> = [];
  const rootFamily = attribute(/<svg\b[^>]*>/.exec(svg)?.[0] ?? "", "font-family") ?? "";
  let family = rootFamily;
  let weight = 400;
  const tags = /<(\/?)(text|tspan)\b([^>]*?)(\/?)>|([^<]+)/g;
  for (const match of svg.matchAll(tags)) {
    if (match[5] !== undefined) {
      if (stack.length > 0 && match[5].trim() !== "") {
        const bundled = bundledFamily(family);
        if (bundled) used.add(bundledFaceFor(bundled, weight).id);
      }
      continue;
    }
    if (match[1] === "/") {
      const closed = stack.pop();
      if (closed) {
        family = stack.at(-1)?.family ?? rootFamily;
        weight = stack.at(-1)?.weight ?? 400;
      }
      continue;
    }
    const tag = match[0];
    const nextFamily = attribute(tag, "font-family") ?? family;
    const nextWeight = weightOf(attribute(tag, "font-weight"), weight);
    if (match[4] === "/") continue;
    stack.push({ family: nextFamily, weight: nextWeight, tag: match[2]! });
    family = nextFamily;
    weight = nextWeight;
  }
  return BUNDLED_FACES.filter((face) => used.has(face.id));
}

/** The base64 of `bytes` (no Buffer: this module also runs in browsers). */
export function base64Of(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * `svg` with an @font-face rule (woff2 data: URL) for every bundled face its
 * text paints with, in a <defs><style> right after the root element's open
 * tag. `loadFace` returns a face's woff2 bytes, or null when the host cannot
 * supply them (that face then stays a named family). Unchanged when the SVG
 * paints no bundled face.
 */
export async function embedSvgFonts(
  svg: string,
  loadFace: (face: BundledFace) => Promise<Uint8Array | null>,
): Promise<string> {
  const faces = svgFontFaces(svg);
  if (faces.length === 0) return svg;
  const rules: string[] = [];
  for (const face of faces) {
    const bytes = await loadFace(face);
    if (!bytes) continue;
    rules.push(
      `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${face.weight};` +
        `src:url(data:font/woff2;base64,${base64Of(bytes)}) format("woff2")}`,
    );
  }
  if (rules.length === 0) return svg;
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;
  const at = open.index + open[0].length;
  return `${svg.slice(0, at)}<defs><style>${rules.join("")}</style></defs>${svg.slice(at)}`;
}
