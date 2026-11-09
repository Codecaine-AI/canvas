/**
 * Section colors and hierarchy — one rule, read by the tools that prevent a
 * break and the integrity lint that reports one: a nested section never
 * shares its parent section's color, so each level of the hierarchy reads.
 *
 * "Color" here is the hue the section paints, not only the stored pick:
 * - flat (figjam) paints one tint per stored color, so equal colors are equal fills;
 * - layer-cake (schematic) deepens the same ink one tint step per level and
 *   caps it, so a child of the same color reads as the same color (a shade
 *   apart at best, identical at the cap); and on a dark board it paints
 *   `white` as `gray`, so those two are one hue there.
 *
 * The page is exempt as a parent: the page frame (PAGE_FRAME_ID), or a
 * board's one root section, which plays that role on a stored board (the
 * digest's pageFrameOf). It is the page, not a group, and the sections on it
 * are the top level — on a dark board a stored white page paints gray, and
 * its gray sections still read as groups on a page.
 */
import { CANVAS_COLORS, type CanvasColor } from "../state/schema/colors";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
import { isLightBoard } from "../theme/palette";
import { kindOf, pageFrameOf } from "./helpers";
import { PAGE_FRAME_ID } from "./page-frame";

/**
 * The order a section's color is picked in when the call names none: gray
 * first (the default), then the hues that read as groups. White is the page's
 * color and red means failure, so white is never picked and red comes last.
 */
const SECTION_PICK_ORDER: readonly CanvasColor[] = [
  "gray",
  "blue",
  "teal",
  "violet",
  "green",
  "orange",
  "yellow",
  "pink",
  "red",
];

/** The hue a section paints under `style` (see the module note). */
export function sectionHue(
  section: Pick<InteractiveCanvasObject, "color">,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasColor {
  const color = section.color ?? FIRST_USE_COLORS.section;
  return color === "white" && style.sectionFill === "layer-cake" && !isLightBoard(style) ? "gray" : color;
}

/** A section painted in the same hue as its direct parent section. */
export interface SameHueNest {
  section: string;
  parent: string;
  /** The stored color of the parent, as the agent names it. */
  parentColor: CanvasColor;
}

/** The parent section of `object`, unless that parent is the page. */
function parentSectionOf(
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
  pageId: string | undefined,
  object: InteractiveCanvasObject,
): InteractiveCanvasObject | null {
  const parent = object.parentId ? byId.get(object.parentId) : undefined;
  if (!parent || kindOf(parent) !== "section" || parent.id === PAGE_FRAME_ID || parent.id === pageId) return null;
  return parent;
}

/** Every section whose hue equals its direct parent section's (the page exempt). */
export function sameHueNests(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SameHueNest[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const pageId = pageFrameOf(document)?.id;
  const nests: SameHueNest[] = [];
  for (const section of document.objects) {
    if (kindOf(section) !== "section") continue;
    const parent = parentSectionOf(byId, pageId, section);
    if (!parent || sectionHue(parent, style) !== sectionHue(section, style)) continue;
    nests.push({ section: section.id, parent: parent.id, parentColor: parent.color ?? FIRST_USE_COLORS.section });
  }
  return nests;
}

/**
 * The color for section `id` when its call names none, judged on a document
 * whose membership is already reconciled: never its parent section's hue nor
 * the hue of a section it holds, and, for a top-level section (on the page or
 * on no parent), one its sibling sections do not use while one is free.
 */
export function pickSectionColor(
  document: InteractiveCanvasDocument,
  id: string,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasColor {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const section = byId.get(id);
  if (!section) return FIRST_USE_COLORS.section;
  const sections = document.objects.filter((object) => kindOf(object) === "section" && object.id !== id);
  const parent = parentSectionOf(byId, pageFrameOf(document)?.id, section);
  const banned = new Set<CanvasColor>([
    ...(parent ? [sectionHue(parent, style)] : []),
    ...sections.filter((object) => object.parentId === id).map((object) => sectionHue(object, style)),
  ]);
  const allowed = SECTION_PICK_ORDER.filter((color) => !banned.has(sectionHue({ color }, style)));
  if (!parent) {
    const parentId = section.parentId ?? null;
    const used = new Set(sections.filter((object) => (object.parentId ?? null) === parentId).map((object) => sectionHue(object, style)));
    const fresh = allowed.find((color) => !used.has(color));
    if (fresh) return fresh;
  }
  return allowed[0] ?? FIRST_USE_COLORS.section;
}

/** A color other than `color` (and other than `also`), for the refusal to suggest. */
export function otherSectionColor(color: CanvasColor, also: readonly CanvasColor[] = []): CanvasColor {
  return SECTION_PICK_ORDER.find((candidate) => candidate !== color && !also.includes(candidate))
    ?? CANVAS_COLORS.find((candidate) => candidate !== color)!;
}
