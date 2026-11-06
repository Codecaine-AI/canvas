/**
 * covered-content — nothing may sit on content (error tier).
 *
 * Checks, all on real geometry (chips are the renderer's own chips at the
 * router's own label point), and only real overlaps — contact is not a
 * finding:
 * - box-on-box: sibling boxes (same parent; sections and stickies exempt)
 *   whose painted faces (paintedRects: an icon's tile and caption, any other
 *   box's face — never the empty sides of an icon's box) intersect by more
 *   than 25% of the smaller painted area or cover a box's text center;
 * - chip-on-box: a label chip over what a box paints (an icon's tile and
 *   caption, any other box's face), its own endpoint boxes included;
 * - chip-on-chip: two label chips overlapping;
 * - chip-on-edge: a chip lying along ANOTHER edge's routed wire for more
 *   than 8px;
 * - section-on-section: two sections whose frames overlap when neither
 *   contains the other in the section tree (sections grow to hold their
 *   children, and a grow can push one frame into its neighbor).
 *
 * Chip findings that hang on the chip's last measured pixel, or on a label
 * whose width is an estimate, are notes (geometry.ts chipFindingSeverity).
 */
import {
  chipFindingSeverity,
  chipFor,
  chipNoteClause,
  intersects,
  paintedRects,
  polylineLengthInRect,
  routedPolyline,
  type Chip,
  type Rect,
} from "../geometry";
import { kindOf } from "../../helpers";

import type { LayoutRule, Severity } from "../types";

/** The note clause for a chip pair: whichever chip is the unreliable one, else the tolerance. */
function pairNoteClause(a: Chip, b: Chip, severity: Severity): string {
  if (severity !== "note") return "";
  return chipNoteClause(!a.reliable ? a : b, severity);
}

/** Intersection larger than this fraction of the smaller box is an error. */
const OVERLAP_FRACTION = 0.25;
/** A chip lying on another edge's path for more than this run is a finding. */
const EDGE_RUN_TOLERANCE = 8;

function intersection(aRect: Rect, bRect: Rect): Rect | undefined {
  const x = Math.max(aRect.x, bRect.x);
  const y = Math.max(aRect.y, bRect.y);
  const width = Math.min(aRect.x + aRect.width, bRect.x + bRect.width) - x;
  const height = Math.min(aRect.y + aRect.height, bRect.y + bRect.height) - y;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

const area = (rect: Rect) => rect.width * rect.height;

/** The bounding rect of `rects` (at least one). */
function bounds(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Is the node's text center strictly inside one of `rects`? The text center
 * is the center of the last face it paints: an icon's caption band (its
 * tile when it has no caption), any other box's face.
 */
function coversTextCenter(painted: readonly Rect[], rects: readonly Rect[]): boolean {
  const face = painted[painted.length - 1]!;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  return rects.some((rect) => cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height);
}

/** True when `ancestorId` is `id` itself or one of its section ancestors. */
function isAncestor(byParent: ReadonlyMap<string, string | null>, ancestorId: string, id: string): boolean {
  let at: string | null | undefined = id;
  for (let steps = 0; at != null && steps <= byParent.size; steps += 1) {
    if (at === ancestorId) return true;
    at = byParent.get(at);
  }
  return false;
}

const GUIDANCE = `Nothing sits on content. Blocking (error tier):
- two section frames overlapping when neither holds the other;
- a box overlap that swallows more than a quarter of what the smaller box paints (an icon's
  tile and caption, a shape's face), or lands on its text;
- a label chip on a box face (its own endpoints included), on another chip, or lying along
  another edge's wire.
Fix it by moving the label along its wire with move_label, routing around the crowd, or
moving a box so the chip has room. Stickies float above the diagram and are exempt.`;

export const rule: LayoutRule = {
  id: "covered-content",
  title: "Covered content",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const boxes = document.objects.filter((object) => kindOf(object) === "node");

    // 1 — box-on-box, on what each box paints.
    const faces = new Map(boxes.map((node) => [node.id, paintedRects(node, context?.canvasStyle)]));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;
        const aFaces = faces.get(a.id)!;
        const bFaces = faces.get(b.id)!;
        const pieces = aFaces.flatMap((aFace) => bFaces
          .map((bFace) => intersection(aFace, bFace))
          .filter((piece): piece is Rect => piece !== undefined));
        if (pieces.length === 0) continue;
        const smallerArea = Math.min(
          aFaces.reduce((sum, face) => sum + area(face), 0),
          bFaces.reduce((sum, face) => sum + area(face), 0),
        );
        if (smallerArea <= 0) continue;
        const fraction = pieces.reduce((sum, piece) => sum + area(piece), 0) / smallerArea;
        const covered = [a, b].filter((node) => coversTextCenter(faces.get(node.id)!, pieces));
        const rect = bounds(pieces);
        if (fraction <= OVERLAP_FRACTION && covered.length === 0) continue;
        const pct = Math.round(fraction * 100);
        const centerNote = covered.length > 0
          ? `; covers the text center of ${covered.map((node) => node.id).join(" and ")}`
          : "";
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [a.id, b.id],
          where: rect,
          message: `${a.id} and ${b.id} overlap by ${pct}% of the smaller box${centerNote}`,
          suggestion: `move ${b.id} clear of ${a.id}`,
        });
      }
    }

    // 1b — section-on-section: frames that overlap outside a parent-child
    // line. Contact is not a finding; only a real shared area is.
    const sections = document.objects.filter((object) => kindOf(object) === "section");
    const byParent = new Map(document.objects.map((object) => [object.id, object.parentId ?? null]));
    for (let i = 0; i < sections.length; i += 1) {
      for (let j = i + 1; j < sections.length; j += 1) {
        const a = sections[i]!;
        const b = sections[j]!;
        if (isAncestor(byParent, a.id, b.id) || isAncestor(byParent, b.id, a.id)) continue;
        const shared = intersection(a.geometry, b.geometry);
        if (!shared) continue;
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [a.id, b.id],
          where: shared,
          message: `sections ${a.id} and ${b.id} overlap by ${Math.round(shared.width)}×${Math.round(shared.height)}px`,
          suggestion: `move_to ${b.id} clear of ${a.id}, or move the children that make one of them grow`,
        });
      }
    }

    const chips = document.connections
      .map((edge) => chipFor(edge, document, context?.canvasStyle))
      .filter((chip): chip is Chip => chip !== undefined);

    // 2 — chip vs box: a chip over what any box paints (an icon's tile and
    // caption, not the empty sides of its box). Its own endpoints count too:
    // a chip on its own endpoint hides that box's text just the same.
    for (const chip of chips) {
      for (const node of boxes) {
        const painted = paintedRects(node, context?.canvasStyle);
        const covers = (rect: Rect) => painted.some((face) => intersects(rect, face));
        if (!covers(chip.rect)) continue;
        const own = node.id === chip.edge.from.objectId || node.id === chip.edge.to.objectId;
        if (own && chip.edge.from.objectId === chip.edge.to.objectId) continue; // a self-loop is broken-edges'
        const severity = chipFindingSeverity(chip, covers, "error");
        findings.push({
          rule: "covered-content",
          severity,
          at: [chip.edge.id, node.id],
          where: chip.rect,
          message: `label "${chip.label}" chip on ${chip.edge.id} covers ${own ? "its endpoint " : ""}${node.id}`
            + chipNoteClause(chip, severity),
          suggestion: own
            ? `move_label ${chip.edge.id} to a stretch of its wire clear of ${node.id}, or move one end so the wire is long enough to hold the chip`
            : `move_label ${chip.edge.id} along its wire to a stretch clear of ${node.id}, or move_to ${node.id} clear of the wire`,
        });
      }
    }

    // 3 — chip vs chip.
    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i]!;
        const b = chips[j]!;
        if (!intersects(a.rect, b.rect)) continue;
        const severity: Severity = intersects(a.narrowRect, b.narrowRect) ? "error" : "note";
        findings.push({
          rule: "covered-content",
          severity,
          at: [a.edge.id, b.edge.id],
          where: a.rect,
          message: `label "${a.label}" chip on ${a.edge.id} overlaps label "${b.label}" chip on ${b.edge.id}${pairNoteClause(a, b, severity)}`,
          suggestion: "move_label one chip along its wire so the two do not meet, or move_to a node so the two edges part",
        });
      }
    }

    // 4 — chip vs another edge's routed polyline: a run of more than
    // EDGE_RUN_TOLERANCE px through the chip.
    for (const chip of chips) {
      for (const edge of document.connections) {
        if (edge.id === chip.edge.id) continue;
        const polyline = routedPolyline(edge, document, context?.canvasStyle);
        if (polyline.length < 2) continue;
        const run = polylineLengthInRect(polyline, chip.rect);
        if (run <= EDGE_RUN_TOLERANCE) continue;
        const severity = chipFindingSeverity(
          chip, (rect) => polylineLengthInRect(polyline, rect) > EDGE_RUN_TOLERANCE, "error",
        );
        findings.push({
          rule: "covered-content",
          severity,
          at: [chip.edge.id, edge.id],
          where: chip.rect,
          message: `label "${chip.label}" chip on ${chip.edge.id} lies on ${edge.id}'s path for ${Math.round(run)}px${chipNoteClause(chip, severity)}`,
          suggestion: `move_label ${chip.edge.id} along its wire to a stretch ${edge.id} does not share, or move_to a node so the two wires part`,
        });
      }
    }

    return findings;
  },
};
