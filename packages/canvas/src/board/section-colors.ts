/**
 * Section colors and hierarchy — one rule, read by the tools that prevent a
 * break and the integrity lint that reports one, so a viewer sees where each
 * group starts and ends without the colors losing the board's meaning:
 *
 * - A section never looks like its parent section. It takes the next tone
 *   step of its own hue (layer cake), so the nest reads by tone and hue.
 * - Two sibling sections (same parent; the page is the parent of top-level
 *   sections) never look alike when they touch: edges closer than one gutter
 *   (TOUCH_GUTTER) with some part of the gap between them clear of other
 *   siblings. Siblings with whitespace between them may share a hue: the gap
 *   is the separator, and same-role sections keep one color.
 * - A section that holds nodes of several hues never paints one of them:
 *   that node would lose its figure against the ground. A category section
 *   (every colored node it holds directly shares one hue) may take that
 *   hue: the frame then names the category, which is the board's meaning.
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
 * The chooser (place_section, Studio placement and copies, every suggestion)
 * keeps meaning first: hues the board's nodes and wires use are its key and
 * stay off the list, warm hues stay for the emphasis a drawer picks, and a
 * board carries at most MAX_SECTION_HUES chromatic section hues plus gray.
 * It never recolors a section by itself.
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
 * The hues the chooser hands out, in order. Gray is the neutral and costs no
 * hue; teal comes last, since at one tone it sits close to both blue and
 * green. Warm hues (orange, yellow, pink, red) are not here: they read as
 * emphasis, which the drawer chooses.
 */
const CHOOSER_HUES: readonly CanvasColor[] = ["gray", "blue", "violet", "green", "teal"];

/** The emphasis hues, picked by the chooser only when nothing cooler keeps the rules. */
const WARM_HUES: readonly CanvasColor[] = ["orange", "yellow", "pink", "red"];

/** Most chromatic hues (gray and white aside) the chooser lets one board's sections carry. */
const MAX_SECTION_HUES = 3;

/**
 * One gutter: sibling frames whose edges sit closer than this read as one
 * border, so they touch. Wider whitespace separates them on its own.
 */
export const TOUCH_GUTTER = 48;

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

/** The edge-to-edge distance between two frames (0 when they meet). */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

/** True when the intervals leave some part of [lo, hi] uncovered. */
function leavesGap(lo: number, hi: number, covers: readonly [number, number][]): boolean {
  let reach = lo;
  for (const [start, end] of [...covers].sort((a, b) => a[0] - b[0])) {
    if (start > reach) return true;
    reach = Math.max(reach, end);
    if (reach >= hi) return false;
  }
  return reach < hi;
}

/**
 * Two sibling frames touch when their edges sit closer than one gutter and
 * the eye can cross straight from one to the other: they overlap, they meet
 * at a near corner, or they face across a row or column and some part of
 * that shared span is clear of every other sibling frame. A blocker that
 * covers only part of the span leaves the rest facing.
 */
function touching(a: Box, b: Box, others: readonly Box[]): boolean {
  if (gapBetween(a, b) >= TOUCH_GUTTER) return false;
  const xSpan = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
  const ySpan = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
  // Both spans overlap: the frames overlap. Neither does: a near corner.
  if (Boolean(xSpan) === Boolean(ySpan)) return true;
  // Facing across a gap: the strip between the two edges, along the shared span.
  const [span, gapLo, gapHi, along, across] = xSpan
    ? (() => {
      const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
      return [xSpan, top.y + top.height, bottom.y, "x", "y"] as const;
    })()
    : (() => {
      const [left, right] = a.x <= b.x ? [a, b] : [b, a];
      return [ySpan!, left.x + left.width, right.x, "y", "x"] as const;
    })();
  const size = { x: "width", y: "height" } as const;
  const covers: [number, number][] = [];
  for (const other of others) {
    const depth = overlap(other[across], other[across] + other[size[across]], gapLo, gapHi);
    const cover = overlap(other[along], other[along] + other[size[along]], span[0], span[1]);
    if (depth && cover) covers.push(cover);
  }
  return leavesGap(span[0], span[1], covers);
}

/** The sibling sections `section` touches. */
function touchingSiblingsOf(
  section: InteractiveCanvasObject,
  siblings: readonly InteractiveCanvasObject[],
): InteractiveCanvasObject[] {
  return siblings.filter((twin) => touching(
    section.geometry,
    twin.geometry,
    siblings.filter((other) => other !== twin).map((other) => other.geometry),
  ));
}

function isChromatic(color: CanvasColor): boolean {
  return color !== "gray" && color !== "white";
}

/** The chromatic hues of the nodes section `id` holds directly (gray and white nodes and stickies aside). */
function heldNodeHues(document: InteractiveCanvasDocument, id: string): Set<CanvasColor> {
  return new Set(document.objects
    .filter((object) => object.parentId === id && kindOf(object) === "node" && object.color && isChromatic(object.color))
    .map((object) => object.color!));
}

/**
 * The hue of a category section: the one chromatic hue every colored node
 * it holds directly shares. Null when it holds no colored node, or several
 * hues.
 */
export function categoryHue(document: InteractiveCanvasDocument, id: string): CanvasColor | null {
  const held = heldNodeHues(document, id);
  return held.size === 1 ? [...held][0]! : null;
}

/** The board's color key: the chromatic hues its nodes and wires use. */
function keyHues(document: InteractiveCanvasDocument): Set<CanvasColor> {
  const hues = new Set<CanvasColor>();
  for (const object of document.objects) {
    if (kindOf(object) === "node" && object.color && isChromatic(object.color)) hues.add(object.color);
  }
  for (const connection of document.connections) {
    if (connection.color && isChromatic(connection.color)) hues.add(connection.color);
  }
  return hues;
}

/** Teal beside blue or green at one tone reads as one family. */
function nearTwins(a: CanvasColor, b: CanvasColor): boolean {
  return (a === "teal" && (b === "blue" || b === "green")) || (b === "teal" && (a === "blue" || a === "green"));
}

/**
 * The color for section `id` when its call names none, judged on a document
 * whose membership is already reconciled. Hard rules: it looks like neither
 * its parent section, a section it holds, nor a sibling it touches, and,
 * holding nodes of several hues, it takes none of them. A category section
 * takes its category's hue whenever that keeps the rules, past the hue cap:
 * the category carries meaning. Then `prefer` (Studio's last pick, or a
 * copy's source color) wins whenever it keeps those rules. Otherwise the
 * first of CHOOSER_HUES the board's nodes and wires leave free, keeping the
 * board to MAX_SECTION_HUES chromatic section hues, and not teal beside a
 * touching blue or green (nor those beside a touching teal) while another
 * fits. With nothing free under the cap, the hue of the farthest sibling
 * it does not touch (a cool one first), then a cool hue the key uses; warm
 * hues come last.
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
  const parent = parentSectionOf(byId, section);
  const children = document.objects.filter((object) => kindOf(object) === "section" && object.parentId === id);
  const siblings = siblingSectionsOf(document, byId, section);
  const near = touchingSiblingsOf(section, siblings);
  const held = heldNodeHues(document, id);
  const category = held.size === 1 ? [...held][0]! : null;
  const neighbors = [...(parent ? [parent] : []), ...children, ...near];
  const keeps = (color: CanvasColor) =>
    (category !== null || !held.has(sectionHue({ color }, style)))
    && neighbors.every((other) => !looksAlike({ color, depth }, paintedOf(other, depths), style));
  if (category && keeps(category)) return category;
  if (prefer && keeps(prefer)) return prefer;

  const key = keyHues(document);
  const used = new Set(document.objects
    .filter((object) => object.id !== id && kindOf(object) === "section" && !isPageSection(object))
    .map((object) => sectionHue(paintedOf(object, depths), style))
    .filter(isChromatic));
  const underCap = (color: CanvasColor) => !isChromatic(color) || used.has(color) || used.size < MAX_SECTION_HUES;
  const pool = CHOOSER_HUES.filter((color) => !key.has(color) && keeps(color) && underCap(color));
  const calm = pool.find((color) => near.every((other) => !nearTwins(color, sectionHue(paintedOf(other, depths), style))));
  if (calm ?? pool[0]) return (calm ?? pool[0])!;

  // Nothing free under the cap: repeat the farthest sibling it does not touch
  // (a cool hue first), then a cool hue the key uses, then a warm repeat.
  const far = siblings
    .filter((twin) => !near.includes(twin) && keeps(paintedOf(twin, depths).color))
    .sort((a, b) => gapBetween(section.geometry, b.geometry) - gapBetween(section.geometry, a.geometry))
    .map((twin) => paintedOf(twin, depths).color);
  const fallback = far.find((color) => CHOOSER_HUES.includes(color))
    ?? CHOOSER_HUES.find((color) => keeps(color) && underCap(color))
    ?? far[0]
    // White only as a nested section's last resort: on the page, white is the page's own color.
    ?? [...CHOOSER_HUES, ...WARM_HUES, ...(parent ? ["white" as const] : [])].find(keeps);
  return fallback ?? FIRST_USE_COLORS.section;
}

/** Two touching sibling sections that look alike. */
export interface SiblingClash {
  /** The section to recolor: the later one in document order. */
  section: string;
  /** The sibling it looks like. */
  sibling: string;
  color: CanvasColor;
  siblingColor: CanvasColor;
  /** A color that reads apart from the section's parent, children and touching siblings. */
  suggestion: CanvasColor;
}

/** What two siblings share, for a message: "gray", or "one fill (blue and gray)". */
export function sharedSiblingLook(clash: SiblingClash): string {
  return clash.color === clash.siblingColor ? clash.color : `one fill (${clash.color} and ${clash.siblingColor})`;
}

/**
 * Every pair of touching sibling sections that look alike, each named on
 * the later section in document order (the earlier keeps its color). The
 * tools compare these pairs before and after an edit.
 */
export function siblingClashPairs(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SiblingClash[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const depths = sectionDepthMap(document.objects);
  const sections = document.objects.filter((object) => kindOf(object) === "section" && !isPageSection(object));
  const suggestions = new Map<string, CanvasColor>();
  const suggestionFor = (id: string) => {
    let color = suggestions.get(id);
    if (!color) suggestions.set(id, (color = pickSectionColor(document, id, style)));
    return color;
  };
  const clashes: SiblingClash[] = [];
  for (const [index, later] of sections.entries()) {
    const key = siblingKey(byId, later);
    const group = sections.filter((other) => siblingKey(byId, other) === key);
    for (const earlier of sections.slice(0, index)) {
      if (siblingKey(byId, earlier) !== key) continue;
      if (!looksAlike(paintedOf(later, depths), paintedOf(earlier, depths), style)) continue;
      const others = group.filter((other) => other !== later && other !== earlier).map((other) => other.geometry);
      if (!touching(later.geometry, earlier.geometry, others)) continue;
      clashes.push({
        section: later.id,
        sibling: earlier.id,
        color: paintedOf(later, depths).color,
        siblingColor: paintedOf(earlier, depths).color,
        suggestion: suggestionFor(later.id),
      });
    }
  }
  return clashes;
}

/** Touching sibling clashes, one per section to recolor: what integrity reports. */
export function siblingClashes(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SiblingClash[] {
  const reported = new Set<string>();
  return siblingClashPairs(document, style).filter((clash) => {
    if (reported.has(clash.section)) return false;
    reported.add(clash.section);
    return true;
  });
}

/** A section holding nodes of several hues, painted one of them. */
export interface HeldNodeClash {
  section: string;
  /** The first node it holds in that hue. */
  node: string;
  color: CanvasColor;
  /** A color that keeps the section apart from its parent, children, touching siblings and nodes. */
  suggestion: CanvasColor;
}

/**
 * Every section that holds nodes of several hues directly and paints one of
 * them, so that node keeps only its border. A category section is exempt.
 */
export function heldNodeClashes(
  document: InteractiveCanvasDocument,
  style: CanvasStyle = DEFAULT_CANVAS_STYLE,
): HeldNodeClash[] {
  const clashes: HeldNodeClash[] = [];
  for (const section of document.objects) {
    if (kindOf(section) !== "section" || isPageSection(section)) continue;
    const hue = sectionHue(section, style);
    if (!isChromatic(hue) || categoryHue(document, section.id) !== null) continue;
    const node = document.objects.find((object) =>
      object.parentId === section.id && kindOf(object) === "node" && object.color === hue);
    if (!node) continue;
    clashes.push({ section: section.id, node: node.id, color: hue, suggestion: pickSectionColor(document, section.id, style) });
  }
  return clashes;
}

/** The id the placement probe gives a section before the reducer names it. */
const PLACEMENT_PROBE_ID = "__section-color-probe__";

/**
 * Studio's placement of a section with no color named, given the color
 * place_section would pick: the last-picked color when it keeps the rules,
 * else pickSectionColor's. Membership is read the way the reducer will
 * assign it (snapped geometry, reconciled tree). Every other action passes
 * through unchanged.
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

/**
 * Studio's duplicate and paste, after the reducer has reconciled membership:
 * each copied section keeps its source color while that keeps the rules,
 * else takes pickSectionColor's, one copy at a time in document order so a
 * later copy sees the earlier ones. Other actions pass `after` through.
 */
export function withCopiedSectionColors(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
  action: CanvasAction,
  style: CanvasStyle,
): InteractiveCanvasDocument {
  if (after === before || (action.type !== "canvas.duplicateSelection" && action.type !== "canvas.addObjects")) return after;
  const existing = new Set(before.objects.map((object) => object.id));
  let document = after;
  for (const copy of after.objects) {
    if (existing.has(copy.id) || kindOf(copy) !== "section" || isPageSection(copy)) continue;
    const kept = copy.color ?? FIRST_USE_COLORS.section;
    const color = pickSectionColor(document, copy.id, style, kept);
    if (color === kept) continue;
    document = {
      ...document,
      objects: document.objects.map((object) => (object.id === copy.id ? { ...object, color } : object)),
    };
  }
  return document;
}
