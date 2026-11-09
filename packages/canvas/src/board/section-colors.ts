/**
 * Section colors and hierarchy — one rule, read by the tools that prevent a
 * break and the integrity lint that reports one: a nested section never
 * looks like its parent section, so each level of the hierarchy reads.
 *
 * Two sections look alike when either holds:
 * - they paint the same ink (sectionHue). Layer-cake (schematic) deepens one
 *   ink a tint step per level, so a gray child of a gray parent is a shade
 *   apart at best — still "gray in gray", the nest the hierarchy rule bans;
 * - the fills the renderer paints (resolveSectionPaint, at each section's
 *   real depth, under the board's style) are equal or within
 *   SAME_FILL_DISTANCE. With `sectionTintMax` 0 every hue paints one fill,
 *   so blue in gray is a nest there.
 *
 * The page is exempt as a parent, and only the page: the page frame
 * (PAGE_FRAME_ID), or a parentless section stored white (a page-colored
 * root, like a stored board's s00-page). The identity is stable: it reads
 * only the section itself, so adding or removing other roots never changes it.
 */
import type { CanvasAction } from "../state/actions/types";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";
import type { CanvasColor } from "../state/schema/colors";
import { defaultGeometryFor, draftPlacedObject, FIRST_USE_COLORS } from "../state/schema/object-defaults";
import { snapGeometry } from "../state/geometry";
import { sectionDepthMap } from "../state/section-depth";
import { reconcileSectionMembership } from "../state/section-membership";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
import { oklabDistance } from "../theme/color-math";
import { isLightBoard, resolveSectionPaint } from "../theme/palette";
import { kindOf } from "./helpers";
import { PAGE_FRAME_ID } from "./page-frame";

/**
 * The order a section's color is picked in when the call names none: gray
 * first (the default), then the hues that read as groups. White is the page's
 * color and red means failure, so red comes last and white is picked only for
 * a nested section when no hue paints apart from its neighbors.
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

/**
 * Fills closer than this (OKLab distance) are one fill: about one RGB step
 * near white. The closest distinct fills the presets paint between hues or
 * levels are 0.010 apart.
 */
const SAME_FILL_DISTANCE = 0.005;

/** The ink a section paints under `style`: on a dark layer-cake board white paints as gray. */
export function sectionHue(
  section: Pick<InteractiveCanvasObject, "color">,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasColor {
  const color = section.color ?? FIRST_USE_COLORS.section;
  return color === "white" && style.sectionFill === "layer-cake" && !isLightBoard(style) ? "gray" : color;
}

/** The page: the page frame, or a parentless section stored white. */
export function isPageSection(section: Pick<InteractiveCanvasObject, "id" | "parentId" | "color">): boolean {
  return section.id === PAGE_FRAME_ID || ((section.parentId ?? null) === null && section.color === "white");
}

/** A color at a depth: what one section paints. */
interface Painted {
  color: CanvasColor;
  depth: number;
}

function sectionFill(painted: Painted, style: CanvasStyle): string {
  return resolveSectionPaint(painted.color, painted.depth, style).fill;
}

function looksAlike(a: Painted, b: Painted, style: CanvasStyle): boolean {
  return sectionHue(a, style) === sectionHue(b, style)
    || oklabDistance(sectionFill(a, style), sectionFill(b, style)) < SAME_FILL_DISTANCE;
}

/** A section that looks like its direct parent section. */
export interface SameHueNest {
  section: string;
  parent: string;
  /** The stored colors, as the agent names them. */
  color: CanvasColor;
  parentColor: CanvasColor;
  /** A color that would make the section read apart from its parent and the sections it holds. */
  suggestion: CanvasColor;
}

/** What the nested section shares with its parent, for a message: "gray", or "one fill (blue in gray)". */
export function sharedLook(nest: SameHueNest): string {
  return nest.color === nest.parentColor ? nest.color : `one fill (${nest.color} in ${nest.parentColor})`;
}

/** The parent section of `object`, unless that parent is the page. */
function parentSectionOf(
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
  object: InteractiveCanvasObject,
): InteractiveCanvasObject | null {
  const parent = object.parentId ? byId.get(object.parentId) : undefined;
  if (!parent || kindOf(parent) !== "section" || isPageSection(parent)) return null;
  return parent;
}

function paintedOf(object: InteractiveCanvasObject, depths: ReadonlyMap<string, number>): Painted {
  return { color: object.color ?? FIRST_USE_COLORS.section, depth: depths.get(object.id) ?? 1 };
}

/** Every section that looks like its direct parent section (the page exempt). */
export function sameHueNests(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SameHueNest[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const depths = sectionDepthMap(document.objects);
  const nests: SameHueNest[] = [];
  for (const section of document.objects) {
    if (kindOf(section) !== "section") continue;
    const parent = parentSectionOf(byId, section);
    if (!parent || !looksAlike(paintedOf(section, depths), paintedOf(parent, depths), style)) continue;
    nests.push({
      section: section.id,
      parent: parent.id,
      color: paintedOf(section, depths).color,
      parentColor: paintedOf(parent, depths).color,
      suggestion: pickSectionColor(document, section.id, style),
    });
  }
  return nests;
}

/**
 * The color for section `id` when its call names none, judged on a document
 * whose membership is already reconciled: one that looks like neither its
 * parent section nor a section it holds, and, for a top-level section (on the
 * page or on no parent), one its sibling sections do not look like while one
 * is free. `prefer` (Studio's last-picked color) wins whenever it fits.
 */
export function pickSectionColor(
  document: InteractiveCanvasDocument,
  id: string,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
  prefer?: CanvasColor,
): CanvasColor {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const section = byId.get(id);
  if (!section) return FIRST_USE_COLORS.section;
  const depths = sectionDepthMap(document.objects);
  const depth = depths.get(id) ?? 1;
  const sections = document.objects.filter((object) => kindOf(object) === "section" && object.id !== id);
  const parent = parentSectionOf(byId, section);
  const neighbors = [...(parent ? [parent] : []), ...sections.filter((object) => object.parentId === id)];
  const fits = (color: CanvasColor) =>
    neighbors.every((other) => !looksAlike({ color, depth }, paintedOf(other, depths), style));
  if (prefer && fits(prefer)) return prefer;
  // White only as a nested section's last resort: a parentless white section is the page.
  const order = section.parentId ? [...SECTION_PICK_ORDER, "white" as const] : SECTION_PICK_ORDER;
  const allowed = order.filter(fits);
  if (!parent) {
    const parentId = section.parentId ?? null;
    const siblings = sections.filter((object) => (object.parentId ?? null) === parentId);
    const fresh = allowed.find((color) =>
      siblings.every((other) => !looksAlike({ color, depth }, paintedOf(other, depths), style)));
    if (fresh) return fresh;
  }
  return allowed[0] ?? FIRST_USE_COLORS.section;
}

/** The id the placement probe gives a section before the reducer names it. */
const PLACEMENT_PROBE_ID = "__section-color-probe__";

/**
 * Studio's placement of a section with no color named, given the color
 * place_section would pick: the last-picked color when it reads apart from
 * the parent and the sections the new frame adopts, else pickSectionColor's.
 * Membership is read the way the reducer will assign it (snapped geometry,
 * reconciled tree). Every other action passes through unchanged.
 */
export function withPlacedSectionColor(
  document: InteractiveCanvasDocument,
  action: CanvasAction,
  style: CanvasStyle,
  lastPicked: CanvasColor,
): CanvasAction {
  if (action.type !== "canvas.addObject" || action.objectType !== "section" || action.color) return action;
  const geometry = snapGeometry(action.geometry ?? defaultGeometryFor("section"));
  const probe = draftPlacedObject("section", geometry, {
    id: PLACEMENT_PROBE_ID,
    parentId: action.parentId ?? null,
    color: lastPicked,
  });
  const reconciled = reconcileSectionMembership({ ...document, objects: [...document.objects, probe] });
  return { ...action, color: pickSectionColor(reconciled, PLACEMENT_PROBE_ID, style, lastPicked) };
}
