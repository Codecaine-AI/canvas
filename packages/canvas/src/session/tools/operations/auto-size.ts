/**
 * Auto-size — a node's text never clips, and the nodes that sit with it keep
 * one size.
 *
 * Every gesture that sets a node's text or size (`place_shape`, `clone`,
 * `update_text`, `change_shape`, `resize`, `match_size`) ends here with the
 * ids it touched. Two rules, in order:
 *
 * 1. GROW TO FIT. When the renderer's own wrap/clamp verdict
 *    (board/text-fit.ts) says the name does not show whole, the node
 *    grows to `neededSize`, each side rounded up to the 20px agent grid.
 *    It never shrinks. It keeps its center, so a node in a
 *    row stays in that row: an on-grid side grows by whole 40px steps (two
 *    grid units), so its corner stays on the grid and its center does not
 *    move, however many edits it takes to get there. `resize` and
 *    `match_size` hold the top-left corner instead, like the gestures
 *    themselves. A resize below the needed size therefore lands at the needed
 *    size, never clipped.
 *
 * 2. PEERS GROW WITH IT. When rule 1 grew a node, or the node was just
 *    placed (`place_shape`, `clone`), its peers are the shape
 *    nodes of the same type and render shape, under the same parent section,
 *    whose center sits within half a grid unit (10px) of its center before it
 *    grew. The node and the peers that share its ROW all take the row's
 *    largest HEIGHT; the node and the peers that share its COLUMN all take the
 *    column's largest WIDTH. Each peer keeps its center (corner on the grid);
 *    the node itself keeps the anchor of rule 1. Nothing shrinks and nothing
 *    else moves. A box whose match would newly overlap another box it does
 *    not overlap now keeps its size, and the note names the box in the way.
 *    `match_size` never writes its `like` source. So a node placed into a
 *    row that already grew joins the row's size.
 *
 *    Why the dimension across the line, not along it: a row of equal heights
 *    keeps its tops and bottoms in line, and growing every member taller uses
 *    the same room between rows the grown node already used. Widening every
 *    member of a row would close each gap along the row twice as fast as the
 *    one grown node did, and pushes neighbors into each other.
 *
 * 3. A FIXED-ASPECT shape (the octagon, objects/natural-aspect.ts) takes its
 *    ratio: the box from rule 1, or the box the gesture left, grows on its
 *    short side to the ratio (on the grid), with rule 1's anchor. It is never
 *    a peer, so no row or column match stretches it again.
 *
 * 0. A CARD NOTE (a note on the schematic themes) comes before all three:
 *    its height becomes the height its text needs, padding included, on the
 *    grid (objects/sticky/note-fit.ts), shrinking as well as growing; under
 *    `resize` and `match_size` a taller asked height stays. Top-left held,
 *    width as set, never a peer.
 *
 * Left alone: paper stickies (their square is their own business), sections (their
 * frames fit their contents), icons as peers (the glyph tile does not grow;
 * an icon's caption band sizes itself to its name), and any
 * node under a lock.
 */
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../state/schema";
import { reconcileSectionMembership } from "../../../state/section-membership";

import { textFitReport } from "../../../board/text-fit";
import { applyOperationToDraft } from "../../apply-ops";
import { effectiveRenderShape } from "../../../render/static-svg";
import type { CanvasStyle } from "../../../theme/canvas-style";
import { grownToAspect, naturalAspectOf } from "../../../objects/natural-aspect";
import { fittedNoteGeometry, isCardNote } from "../../../objects/sticky/note-fit";
import { AGENT_GRID, snapCoordinate } from "../grid";
import { lockHolding, type OpOutcome } from "./op-context";

/** Where a grown node keeps its place: its center, or its top-left corner (resize). */
export type GrowAnchor = "center" | "corner";

/** How far apart two centers may sit and still share a row or a column. */
export const PEER_CENTER_TOLERANCE_PX = AGENT_GRID / 2;

export interface AutoSizeResult {
  document: InteractiveCanvasDocument;
  /** One line per grown node and per matched peer group, for `OpOutcome.notes`. */
  notes: string[];
}

type Geometry = InteractiveCanvasObject["geometry"];

/**
 * A size rounded up to the grid, never below what the node already has. A
 * centered on-grid side grows by whole 40px steps, so its corner and center
 * both stay on the grid and repeated edits never drift.
 */
function grown(current: number, needed: number, anchor: GrowAnchor): number {
  if (needed <= current) return current;
  const size = Math.ceil(needed / AGENT_GRID) * AGENT_GRID;
  const evenSteps = anchor === "corner" || current % AGENT_GRID !== 0 || (size - current) % (2 * AGENT_GRID) === 0;
  return evenSteps ? size : size + AGENT_GRID;
}

/** The node's new box at `width`×`height`, keeping its center on the grid. */
function aroundCenter(geometry: Geometry, width: number, height: number): Geometry {
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  return {
    ...geometry,
    x: width === geometry.width ? geometry.x : snapCoordinate(cx - width / 2),
    y: height === geometry.height ? geometry.y : snapCoordinate(cy - height / 2),
    width,
    height,
  };
}

/** Text that grows a box: everything but stickies and sections. */
function growsForText(object: InteractiveCanvasObject): boolean {
  return object.type !== "section" && object.type !== "sticky" && effectiveRenderShape(object) !== "note";
}

/** A node that can be matched to its row or column. Icons size by their tile; a fixed-aspect shape by its ratio. */
function canBePeer(object: InteractiveCanvasObject): boolean {
  return growsForText(object) && object.type !== "icon" && naturalAspectOf(object) === null;
}

/** A side on the agent grid, rounded up (a fixed-aspect box grown from an off-grid side). */
function snapUp(value: number): number {
  return Math.ceil(value / AGENT_GRID - 1e-9) * AGENT_GRID;
}

function center(geometry: Geometry): { cx: number; cy: number } {
  return { cx: geometry.x + geometry.width / 2, cy: geometry.y + geometry.height / 2 };
}

function sizeOf(geometry: Geometry): string {
  return `${geometry.width}×${geometry.height}`;
}

/** Whether two boxes share some area (touching edges do not). */
function overlaps(a: Geometry, b: Geometry): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The smallest grid box at or above the current one that shows the text
 * whole, or undefined when the text fits, cannot fit any reasonable box, or
 * the node renders no text.
 */
function fittedSize(
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle,
  anchor: GrowAnchor,
): { width: number; height: number } | undefined {
  const text = object.text ?? "";
  const first = textFitReport(object, object.geometry, text, canvasStyle);
  if (first.fits || !first.neededSize) return undefined;
  const width = grown(object.geometry.width, first.neededSize.width, anchor);
  // The needed height was measured at the needed width; rounding the width
  // up can only lower it, so ask again at the width that will land.
  const atWidth = width === object.geometry.width
    ? first
    : textFitReport(object, { width, height: object.geometry.height }, text, canvasStyle);
  const height = atWidth.fits || !atWidth.neededSize
    ? object.geometry.height
    : grown(object.geometry.height, atWidth.neededSize.height, anchor);
  if (width === object.geometry.width && height === object.geometry.height) return undefined;
  return { width, height };
}

/**
 * Grow each named node to fit its text, then match its row and column peers
 * (see the module doc for the exact rule). Pure: returns the new document and
 * the notes that say what grew.
 */
export function autoSizeObjects(
  input: InteractiveCanvasDocument,
  ids: readonly string[],
  canvasStyle: CanvasStyle,
  anchor: GrowAnchor = "center",
  placed = false,
  readOnly: readonly string[] = [],
): AutoSizeResult {
  // A node placed in this same gesture has no parent yet; peers are judged
  // under the section its geometry puts it in.
  let document = reconcileSectionMembership(input);
  const notes: string[] = [];
  const write = (id: string, geometry: Geometry) => {
    document = applyOperationToDraft(document, {
      type: "updateObject",
      objectId: id,
      patch: { geometry },
    }).document;
  };
  const objectOf = (id: string) => document.objects.find((object) => object.id === id);

  for (const id of ids) {
    const object = objectOf(id);
    if (!object || lockHolding(document, id) !== null) continue;
    // 0. A CARD NOTE takes the height its text needs (objects/sticky/note-fit.ts):
    // exactly, or at least, under a resize. Top-left held, width as set, no peers.
    if (isCardNote(object, canvasStyle)) {
      const geometry = fittedNoteGeometry(object, canvasStyle, anchor === "corner");
      if (geometry !== object.geometry) {
        write(id, geometry);
        notes.push(`fitted ${id} to ${sizeOf(geometry)}: a note is as tall as its text`);
      }
      continue;
    }
    if (!growsForText(object)) continue;
    const fitted = fittedSize(object, canvasStyle, anchor);
    // A fixed-aspect shape (natural-aspect.ts) keeps its box at its ratio
    // whatever the gesture asked, grown on its longer side.
    const aspect = naturalAspectOf(object);
    let size = fitted;
    if (aspect !== null) {
      const atRatio = grownToAspect(fitted ?? object.geometry, aspect);
      const snapped = { width: snapUp(atRatio.width), height: snapUp(atRatio.height) };
      size = snapped.width === object.geometry.width && snapped.height === object.geometry.height ? undefined : snapped;
    }
    if (!size && !placed) continue;
    const before = object.geometry;
    if (size) {
      const geometry = anchor === "corner"
        ? { ...before, ...size }
        : aroundCenter(before, size.width, size.height);
      write(id, geometry);
      notes.push(fitted
        ? `grew ${id} to ${sizeOf(geometry)} so its text shows whole`
        : `sized ${id} to ${sizeOf(geometry)}: a ${object.type} keeps its natural aspect ratio`);
    }
    if (!canBePeer(object)) continue;

    // Peers are found where the node stood BEFORE it grew: rounding its
    // corner onto the grid may move its center by half a grid unit.
    const { cx, cy } = center(before);
    const peersOn = (axis: "row" | "column") =>
      document.objects.filter((other) =>
        other.id !== id
        && !readOnly.includes(other.id)
        && canBePeer(other)
        && other.type === object.type
        && effectiveRenderShape(other) === effectiveRenderShape(object)
        && (other.parentId ?? null) === (object.parentId ?? null)
        && lockHolding(document, other.id) === null
        && (axis === "row"
          ? Math.abs(center(other.geometry).cy - cy) <= PEER_CENTER_TOLERANCE_PX
          : Math.abs(center(other.geometry).cx - cx) <= PEER_CENTER_TOLERANCE_PX));

    const match = (axis: "row" | "column") => {
      const peers = peersOn(axis);
      if (peers.length === 0) return;
      const dimension = axis === "row" ? "height" : "width";
      const self = objectOf(id)!;
      const largest = Math.max(self.geometry[dimension], ...peers.map((peer) => peer.geometry[dimension]));
      const matched: string[] = [];
      for (const member of [self, ...peers]) {
        const g = member.geometry;
        if (g[dimension] >= largest) continue;
        const width = axis === "row" ? g.width : largest;
        const height = axis === "row" ? largest : g.height;
        const next = member.id === id && anchor === "corner"
          ? { ...g, width, height }
          : aroundCenter(g, width, height);
        // Matching is for looks: it never makes an overlap that was not there.
        const blocker = document.objects.find((other) =>
          other.id !== member.id
          && other.type !== "section"
          && overlaps(next, other.geometry)
          && !overlaps(g, other.geometry));
        if (blocker) {
          notes.push(`kept ${member.id} at ${sizeOf(g)}: matching its ${axis} would overlap ${blocker.id}`);
          continue;
        }
        write(member.id, next);
        matched.push(member.id);
      }
      if (matched.length > 0) {
        notes.push(`matched ${axis} peers of ${id} (${matched.join(", ")}) to ${dimension} ${largest}`);
      }
    };
    match("row");
    match("column");
  }
  return { document, notes };
}

/**
 * Run `autoSizeObjects` over an applied outcome's draft and add its notes
 * under the gesture's own. Text that still cannot be promised whole after
 * that — a sticky or section that does not grow, a name no reasonable box
 * holds, characters the bundled fonts lack — keeps its fit note. A no-op
 * passes through.
 */
export function withAutoSize(
  outcome: OpOutcome,
  ids: readonly string[],
  canvasStyle: CanvasStyle,
  anchor: GrowAnchor = "center",
  placed = false,
): OpOutcome {
  if (outcome.status !== "applied") return outcome;
  const { document, notes } = autoSizeObjects(outcome.draft, ids, canvasStyle, anchor, placed);
  for (const id of ids) {
    const object = document.objects.find((entry) => entry.id === id);
    if (!object) continue;
    const report = textFitReport(object, object.geometry, object.text ?? "", canvasStyle);
    if (!report.fits || !report.reliable) notes.push(report.detail);
  }
  if (notes.length === 0) return outcome;
  return { ...outcome, draft: document, notes: [...(outcome.notes ?? []), ...notes] };
}
