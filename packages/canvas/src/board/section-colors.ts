/**
 * Section colors and hierarchy — one rule, read by the tools that prevent a
 * break and the integrity lint that reports one: a section never looks like
 * its parent section or a sibling section (same parent; the page is the
 * parent of top-level sections), so a viewer sees where each group starts
 * and ends.
 *
 * Siblings may repeat a look only when the palette runs out: no color reads
 * apart from the parent, the children and every sibling. Even then two
 * adjacent siblings (facing across a row or column with no sibling between)
 * never share one.
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

/** The sections that share `section`'s parent: the page (or no parent) counts as one parent. */
function siblingSectionsOf(
  document: InteractiveCanvasDocument,
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
  section: InteractiveCanvasObject,
): InteractiveCanvasObject[] {
  const key = siblingKey(byId, section);
  return document.objects.filter((other) =>
    other.id !== section.id
    && kindOf(other) === "section"
    && !isPageSection(other)
    && siblingKey(byId, other) === key);
}

/** The parent a section's siblings share: "" for the page or no parent. */
function siblingKey(byId: ReadonlyMap<string, InteractiveCanvasObject>, section: InteractiveCanvasObject): string {
  return parentSectionOf(byId, section)?.id ?? "";
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The overlap of [a0, a1] and [b0, b1], or null when they do not overlap. */
function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo ? [lo, hi] : null;
}

function boxesMeet(a: Box, b: Box): boolean {
  return overlap(a.x, a.x + a.width, b.x, b.x + b.width) !== null
    && overlap(a.y, a.y + a.height, b.y, b.y + b.height) !== null;
}

/**
 * Two sibling frames are adjacent when they face each other across a row or
 * a column (their spans overlap on one axis) and no other sibling frame sits
 * in the gap between them: the eye reads their edges as one border.
 */
function adjacent(a: Box, b: Box, others: readonly Box[]): boolean {
  const across = (
    span: [number, number] | null,
    gapOf: (lo: Box, hi: Box) => Box,
    start: (box: Box) => number,
  ) => {
    if (!span) return false;
    const [lo, hi] = start(a) <= start(b) ? [a, b] : [b, a];
    const gap = gapOf(lo, hi);
    return !others.some((other) => boxesMeet(other, gap));
  };
  const xSpan = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
  const ySpan = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
  return across(xSpan, (top, bottom) => ({
    x: xSpan![0], width: xSpan![1] - xSpan![0], y: top.y + top.height, height: Math.max(0, bottom.y - top.y - top.height),
  }), (box) => box.y)
    || across(ySpan, (left, right) => ({
      y: ySpan![0], height: ySpan![1] - ySpan![0], x: left.x + left.width, width: Math.max(0, right.x - left.x - left.width),
    }), (box) => box.x);
}

/** The edge-to-edge distance between two frames (0 when they meet). */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

/** What the chooser settled on for one section. */
interface SectionColorChoice {
  color: CanvasColor;
  /** True when `color` reads apart from every sibling; false when the palette ran out and it repeats one. */
  fresh: boolean;
}

function chooseSectionColor(
  document: InteractiveCanvasDocument,
  id: string,
  style: CanvasStyle,
  prefer?: CanvasColor,
): SectionColorChoice {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const section = byId.get(id);
  if (!section) return { color: FIRST_USE_COLORS.section, fresh: true };
  const depths = sectionDepthMap(document.objects);
  const depth = depths.get(id) ?? 1;
  const parent = parentSectionOf(byId, section);
  const children = document.objects.filter((object) => kindOf(object) === "section" && object.parentId === id);
  const neighbors = [...(parent ? [parent] : []), ...children];
  const fits = (color: CanvasColor) =>
    neighbors.every((other) => !looksAlike({ color, depth }, paintedOf(other, depths), style));
  const siblings = siblingSectionsOf(document, byId, section);
  const repeats = (color: CanvasColor) =>
    siblings.filter((other) => looksAlike({ color, depth }, paintedOf(other, depths), style));
  if (prefer && fits(prefer) && repeats(prefer).length === 0) return { color: prefer, fresh: true };
  // White only as a nested section's last resort: on the page, white is the page's own color.
  const order = parent ? [...SECTION_PICK_ORDER, "white" as const] : SECTION_PICK_ORDER;
  const allowed = order.filter(fits);
  const fresh = allowed.find((color) => repeats(color).length === 0);
  if (fresh) return { color: fresh, fresh: true };
  if (allowed.length === 0) return { color: FIRST_USE_COLORS.section, fresh: false };
  // The palette ran out: repeat the color whose look-alike siblings are none
  // adjacent to this section, and of those the one farthest away.
  const others = siblings.map((other) => other.geometry);
  const score = (color: CanvasColor) => {
    const twins = repeats(color);
    const touching = twins.some((twin) =>
      adjacent(section.geometry, twin.geometry, others.filter((box) => box !== twin.geometry)));
    const nearest = Math.min(...twins.map((twin) => gapBetween(section.geometry, twin.geometry)));
    return { touching, nearest };
  };
  let best = allowed[0]!;
  let bestScore = score(best);
  for (const color of allowed.slice(1)) {
    const next = score(color);
    if ((bestScore.touching && !next.touching) || (bestScore.touching === next.touching && next.nearest > bestScore.nearest)) {
      best = color;
      bestScore = next;
    }
  }
  return { color: best, fresh: false };
}

/**
 * The color for section `id` when its call names none, judged on a document
 * whose membership is already reconciled: one that looks like neither its
 * parent section, a section it holds, nor a sibling section. When the palette
 * runs out of colors that read apart from every sibling, it repeats one no
 * adjacent sibling paints, the farthest-away repeat first. `prefer` (Studio's
 * last-picked color) wins whenever it reads apart from all of them.
 */
export function pickSectionColor(
  document: InteractiveCanvasDocument,
  id: string,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
  prefer?: CanvasColor,
): CanvasColor {
  return chooseSectionColor(document, id, style, prefer).color;
}

/** Two sibling sections that look alike where the rule forbids it. */
export interface SiblingClash {
  /** The section to recolor. */
  section: string;
  /** The sibling it looks like. */
  sibling: string;
  color: CanvasColor;
  siblingColor: CanvasColor;
  /** True when the two face each other with no sibling between. */
  adjacent: boolean;
  /** A color that reads apart from the section's parent, children and siblings (a far repeat when none does). */
  suggestion: CanvasColor;
}

/** What two siblings share, for a message: "gray", or "one fill (blue and gray)". */
export function sharedSiblingLook(clash: SiblingClash): string {
  return clash.color === clash.siblingColor ? clash.color : `one fill (${clash.color} and ${clash.siblingColor})`;
}

/**
 * Every pair of sibling sections that look alike, unless the palette ran out
 * for both and they are not adjacent. Each clash names the later section in
 * document order (the earlier keeps its color), or the earlier one when only
 * it has a color left. One clash per recolored section.
 */
export function siblingClashes(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SiblingClash[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const depths = sectionDepthMap(document.objects);
  const sections = document.objects.filter((object) => kindOf(object) === "section" && !isPageSection(object));
  const choices = new Map<string, SectionColorChoice>();
  const choiceOf = (id: string) => {
    let choice = choices.get(id);
    if (!choice) choices.set(id, (choice = chooseSectionColor(document, id, style)));
    return choice;
  };
  const clashes: SiblingClash[] = [];
  const reported = new Set<string>();
  for (const [index, later] of sections.entries()) {
    const key = siblingKey(byId, later);
    const group = sections.filter((other) => siblingKey(byId, other) === key);
    for (const earlier of sections.slice(0, index)) {
      if (siblingKey(byId, earlier) !== key) continue;
      if (!looksAlike(paintedOf(later, depths), paintedOf(earlier, depths), style)) continue;
      const others = group.filter((other) => other !== later && other !== earlier).map((other) => other.geometry);
      const touching = adjacent(later.geometry, earlier.geometry, others);
      const laterFresh = choiceOf(later.id).fresh;
      const earlierFresh = choiceOf(earlier.id).fresh;
      if (!touching && !laterFresh && !earlierFresh) continue;
      const [target, twin] = laterFresh || !earlierFresh ? [later, earlier] : [earlier, later];
      if (reported.has(target.id)) continue;
      reported.add(target.id);
      clashes.push({
        section: target.id,
        sibling: twin.id,
        color: paintedOf(target, depths).color,
        siblingColor: paintedOf(twin, depths).color,
        adjacent: touching,
        suggestion: choiceOf(target.id).color,
      });
    }
  }
  return clashes;
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
