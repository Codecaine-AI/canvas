/**
 * Which characters the bundled faces can paint, from their cmaps
 * (generated/coverage.ts). A grapheme the face cannot paint is "uncovered":
 * the browser draws it with a per-machine fallback font, so its width can
 * only be estimated.
 */

import { type BundledFace, type FaceId } from "./faces.ts";
import { FACE_COVERAGE } from "./generated/coverage.ts";
import { graphemes, isControl, isDefaultIgnorable, isEmojiGrapheme, isPrintableAscii } from "./text.ts";

const bitsets = new Map<readonly number[], Uint32Array>();

/** BMP bitset of one range list, built on first use (8 KB). */
function bmpBits(ranges: readonly number[]): Uint32Array {
  let bits = bitsets.get(ranges);
  if (!bits) {
    bits = new Uint32Array(0x10000 / 32);
    for (let i = 0; i < ranges.length; i += 2) {
      const end = Math.min(ranges[i + 1]!, 0xffff);
      for (let cp = ranges[i]!; cp <= end; cp++) bits[cp >>> 5]! |= 1 << (cp & 31);
    }
    bitsets.set(ranges, bits);
  }
  return bits;
}

/** True when the face's cmap maps `cp`. */
export function faceCovers(faceId: FaceId, cp: number): boolean {
  const ranges = FACE_COVERAGE[faceId];
  if (cp <= 0xffff) return ((bmpBits(ranges)[cp >>> 5]! >>> (cp & 31)) & 1) === 1;
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]!) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]!) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Controls (newline, tab) and lone format characters: zero width, never "uncovered". */
export function isInvisibleGrapheme(grapheme: string): boolean {
  for (const ch of grapheme) {
    const cp = ch.codePointAt(0)!;
    if (!isControl(cp) && !isDefaultIgnorable(cp)) return false;
  }
  return true;
}

/** True when the face cannot paint the grapheme (a code point is missing, or it is an emoji). */
export function isUncoveredGrapheme(grapheme: string, face: BundledFace): boolean {
  if (isEmojiGrapheme(grapheme)) return true;
  for (const ch of grapheme) {
    const cp = ch.codePointAt(0)!;
    if (isControl(cp) || isDefaultIgnorable(cp)) continue;
    if (!faceCovers(face.id, cp)) return true;
  }
  return false;
}

/**
 * True when every code point is covered and nothing needs per-grapheme
 * treatment (controls, format characters, emoji): the whole string is one
 * run in the bundled face.
 */
export function isSimpleCoveredRun(text: string, face: BundledFace): boolean {
  if (isPrintableAscii(text)) return true;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isControl(cp) || isDefaultIgnorable(cp) || cp === 0x20e3) return false;
    if (cp >= 0x2000 && isEmojiGrapheme(ch)) return false;
    if (!faceCovers(face.id, cp)) return false;
  }
  return true;
}

/** Distinct uncovered graphemes of `text` in order of first appearance. */
export function uncoveredGraphemes(text: string, face: BundledFace): string[] {
  if (isPrintableAscii(text)) return [];
  const seen = new Set<string>();
  for (const grapheme of graphemes(text)) {
    if (!seen.has(grapheme) && isUncoveredGrapheme(grapheme, face)) seen.add(grapheme);
  }
  return [...seen];
}
