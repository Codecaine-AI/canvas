/**
 * The faces this package bundles and measures with. Every surface whose text
 * must match the measurements paints with one of these (fonts.css declares
 * them under the same family names).
 */

export type BundledFamily = "Inter" | "IBM Plex Mono";

export interface BundledFace {
  /** Stable id: family slug + weight, e.g. "inter-600". */
  readonly id: FaceId;
  readonly family: BundledFamily;
  /** CSS font-weight the face paints (its OS/2 usWeightClass). */
  readonly weight: number;
  /** File stem under fonts/: `<file>.woff2` (browser) and `<file>.ttf` (headless). */
  readonly file: string;
}

export type FaceId =
  | "inter-400"
  | "inter-500"
  | "inter-600"
  | "inter-700"
  | "plex-mono-400"
  | "plex-mono-500"
  | "plex-mono-600";

export const BUNDLED_FACES: readonly BundledFace[] = [
  { id: "inter-400", family: "Inter", weight: 400, file: "Inter-Regular" },
  { id: "inter-500", family: "Inter", weight: 500, file: "Inter-Medium" },
  { id: "inter-600", family: "Inter", weight: 600, file: "Inter-SemiBold" },
  { id: "inter-700", family: "Inter", weight: 700, file: "Inter-Bold" },
  { id: "plex-mono-400", family: "IBM Plex Mono", weight: 400, file: "IBMPlexMono-Regular" },
  { id: "plex-mono-500", family: "IBM Plex Mono", weight: 500, file: "IBMPlexMono-Medium" },
  { id: "plex-mono-600", family: "IBM Plex Mono", weight: 600, file: "IBMPlexMono-SemiBold" },
];

export const BUNDLED_FAMILIES: readonly BundledFamily[] = ["Inter", "IBM Plex Mono"];

export function facesOf(family: BundledFamily): readonly BundledFace[] {
  return BUNDLED_FACES.filter((face) => face.family === family);
}

const FACE_BY_ID = new Map<string, BundledFace>(BUNDLED_FACES.map((face) => [face.id, face]));

export function faceById(id: FaceId): BundledFace {
  const face = FACE_BY_ID.get(id);
  if (!face) throw new Error(`unknown bundled face "${id}"`);
  return face;
}

/**
 * The face CSS font matching picks for `weight` among the family's bundled
 * weights (CSS Fonts 4, section 5.2, font-weight step): weights in 400..500
 * look up to 500 first, then down, then up; below 400 look down, then up;
 * above 500 look up, then down. That is the face the browser paints, so it is
 * the face we measure. It equals "nearest weight" except at ties and between
 * bundled weights above 500 (620 paints 700 when 700 exists).
 */
/**
 * Whether the browser paints `face` as is for a requested `weight`: the
 * weight is a valid CSS font-weight (1..1000; browsers drop others) and does
 * not trigger synthetic bold, which Chromium applies when the request is 600
 * or more and the matched face is lighter than 600 (verified in Chromium 153:
 * a family with only a 400 face paints faux bold from 600 up). With the
 * bundled faces every weight from 1 to 1000 is painted as is: 300 paints the
 * 400 face, 800 and 900 the 700 face, Plex 700 the 600 face.
 */
export function paintsAsIs(weight: number, face: BundledFace): boolean {
  return weight >= 1 && weight <= 1000 && !(weight >= 600 && face.weight < 600);
}

export function matchFace(family: BundledFamily, weight: number): BundledFace {
  const faces = facesOf(family);
  const exact = faces.find((face) => face.weight === weight);
  if (exact) return exact;
  const below = faces.filter((face) => face.weight < weight).sort((a, b) => b.weight - a.weight);
  const above = faces.filter((face) => face.weight > weight).sort((a, b) => a.weight - b.weight);
  if (weight >= 400 && weight <= 500) {
    const upTo500 = above.filter((face) => face.weight <= 500);
    const rest = above.filter((face) => face.weight > 500);
    return upTo500[0] ?? below[0] ?? rest[0]!;
  }
  if (weight < 400) return below[0] ?? above[0]!;
  return above[0] ?? below[0]!;
}
