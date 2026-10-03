/**
 * FontSpec resolution: which bundled face measures a spec, the CSS string a
 * host paints it with, and the private font string Pretext caches under.
 */

import { BUNDLED_FAMILIES, matchFace, paintsAsIs, type BundledFace, type BundledFamily } from "./faces.ts";
import type { FontSpec } from "./types.ts";

export interface ResolvedFont {
  readonly face: BundledFace;
  readonly size: number;
  readonly letterSpacing: number;
  /** False when letter-spacing is non-zero: browsers then turn ligatures and contextual alternates off. */
  readonly ligatures: boolean;
  /** The first family named a bundled family. */
  readonly knownFamily: boolean;
  /** The requested weight is not a bundled weight of the family (CSS font matching picks `face`). */
  readonly snapped: boolean;
  /** The browser paints `face` as is for the requested weight (see faces.ts paintsAsIs): no synthetic bold, a valid CSS weight. */
  readonly weightPaintsAsIs: boolean;
  /** Font string handed to Pretext (and back to our measuring context). */
  readonly key: string;
}

/**
 * Appended to the Pretext font string when ligatures are off. Pretext caches
 * segment widths per font string, so spaced and unspaced text must not share
 * one; a trailing fallback family keeps the string valid CSS.
 */
const NO_LIGATURES_FAMILY = '"text-measure-no-ligatures"';

function familyCss(family: BundledFamily): string {
  return /\s/.test(family) ? `"${family}"` : family;
}

/** Splits a CSS family list on commas outside quotes and unquotes each name. */
export function splitFamilies(list: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((name) => name.trim().replace(/\s+/g, " ")).filter((name) => name !== "");
}

/** The bundled family a CSS family name refers to, or null. */
export function bundledFamilyOf(name: string | undefined): BundledFamily | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return BUNDLED_FAMILIES.find((family) => family.toLowerCase() === lower) ?? null;
}

function assertFinite(value: unknown, what: string, positive: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive && value <= 0)) {
    throw new TypeError(`text-measure: ${what} must be a ${positive ? "positive " : ""}finite number, got ${String(value)}`);
  }
  return value;
}

const resolved = new Map<string, ResolvedFont>();

export function resolveFont(spec: FontSpec): ResolvedFont {
  if (spec === null || typeof spec !== "object") throw new TypeError("text-measure: font must be a FontSpec object");
  const size = assertFinite(spec.size, "font.size", true);
  const weight = assertFinite(spec.weight ?? 400, "font.weight", true);
  const letterSpacing = assertFinite(spec.letterSpacing ?? 0, "font.letterSpacing", false);
  const familyList = typeof spec.family === "string" ? spec.family : "";
  const cacheKey = `${familyList}\u0000${size}\u0000${weight}\u0000${letterSpacing}`;
  const hit = resolved.get(cacheKey);
  if (hit) return hit;

  const named = bundledFamilyOf(splitFamilies(familyList)[0]);
  const family = named ?? "Inter";
  const face = matchFace(family, weight);
  const ligatures = letterSpacing === 0;
  const font: ResolvedFont = {
    face,
    size,
    letterSpacing,
    ligatures,
    knownFamily: named !== null,
    snapped: face.weight !== weight,
    weightPaintsAsIs: paintsAsIs(weight, face),
    key: `${face.weight} ${size}px ${familyCss(family)}${ligatures ? "" : `, ${NO_LIGATURES_FAMILY}`}`,
  };
  if (resolved.size >= 2048) resolved.clear();
  resolved.set(cacheKey, font);
  return font;
}

/** CSS `font` shorthand for painting the spec: "600 17.5px Inter". Weight and family as given. */
export function fontToCss(spec: FontSpec): string {
  const size = assertFinite(spec.size, "font.size", true);
  const weight = assertFinite(spec.weight ?? 400, "font.weight", true);
  const raw = typeof spec.family === "string" ? spec.family.trim() : "";
  let family: string;
  if (raw === "") family = "Inter";
  else if (/[,"']/.test(raw)) family = raw;
  else if (/\s/.test(raw)) family = `"${raw.replace(/\s+/g, " ")}"`;
  else family = raw;
  return `${weight} ${size}px ${family}`;
}

export interface ParsedFontKey {
  readonly face: BundledFace;
  readonly size: number;
  readonly ligatures: boolean;
}

const KEY_RE = /^(\d+) (\d*\.?\d+(?:e[+-]?\d+)?)px (.+)$/i;
const SHORTHAND_RE = /^\s*((?:\S+\s+)*?)(\d*\.?\d+)(px|pt)(?:\s*\/\s*\S+)?\s+(.+?)\s*$/i;
const parsed = new Map<string, ParsedFontKey>();

/**
 * Reads a font string set on the measuring context: our own keys exactly, and
 * any other CSS font shorthand leniently (someone else calling Pretext in the
 * same process measures through the active backend too).
 */
export function parseFontKey(font: string): ParsedFontKey {
  const hit = parsed.get(font);
  if (hit) return hit;
  let weight = 400;
  let size = 16;
  let families = "Inter";
  const exact = KEY_RE.exec(font);
  if (exact) {
    weight = Number(exact[1]);
    size = Number(exact[2]);
    families = exact[3]!;
  } else {
    const loose = SHORTHAND_RE.exec(font);
    if (loose) {
      for (const token of loose[1]!.trim().split(/\s+/)) {
        if (/^\d{1,4}$/.test(token)) weight = Number(token);
        else if (/^bold(er)?$/i.test(token)) weight = 700;
        else if (/^lighter$/i.test(token)) weight = 300;
      }
      size = Number(loose[2]) * (loose[3]!.toLowerCase() === "pt" ? 4 / 3 : 1);
      families = loose[4]!;
    }
  }
  const names = splitFamilies(families);
  const family = bundledFamilyOf(names[0]) ?? "Inter";
  const result: ParsedFontKey = {
    face: matchFace(family, weight > 0 ? weight : 400),
    size: Number.isFinite(size) && size > 0 ? size : 16,
    ligatures: !names.includes(NO_LIGATURES_FAMILY.slice(1, -1)),
  };
  if (parsed.size >= 2048) parsed.clear();
  parsed.set(font, result);
  return result;
}
