/**
 * covered-content — nothing may sit on content (error tier).
 *
 * Checks, all on real geometry (chips are the renderer's own chips at the
 * router's own label point), and only real overlaps — contact is not a
 * finding:
 * - box-on-box: sibling boxes (same parent; sections and stickies exempt)
 *   whose intersection exceeds 25% of the smaller box or covers a box's text
 *   center;
 * - chip-on-box: a label chip over a box's face, its own endpoint boxes
 *   included;
 * - chip-on-chip: two label chips overlapping;
 * - chip-on-edge: a chip lying along ANOTHER edge's routed wire for more
 *   than 8px.
 *
 * Chip findings that hang on the chip's last measured pixel, or on a label
 * whose width is an estimate, are notes (geometry.ts chipFindingSeverity).
 */
import {
  chipFindingSeverity,
  chipFor,
  chipNoteClause,
  intersects,
  polylineLengthInRect,
  rectOf,
  routedPolyline,
  type Chip,
  type Rect,
} from "../geometry";
import { kindOf } from "../../helpers";

import type { InteractiveCanvasObject } from "../../../state/schema";
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

function intersection(a: InteractiveCanvasObject, b: InteractiveCanvasObject): Rect | undefined {
  const aRect = a.geometry;
  const bRect = b.geometry;
  const x = Math.max(aRect.x, bRect.x);
  const y = Math.max(aRect.y, bRect.y);
  const width = Math.min(aRect.x + aRect.width, bRect.x + bRect.width) - x;
  const height = Math.min(aRect.y + aRect.height, bRect.y + bRect.height) - y;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/** Is the node's text center (its geometric center) strictly inside `rect`? */
function coversTextCenter(node: InteractiveCanvasObject, rect: Rect): boolean {
  const cx = node.geometry.x + node.geometry.width / 2;
  const cy = node.geometry.y + node.geometry.height / 2;
  return cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height;
}

const GUIDANCE = `Nothing sits on content. Blocking (error tier):
- a box overlap that swallows more than a quarter of the smaller box, or lands on its text;
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

    // 1 — box-on-box.
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;
        const rect = intersection(a, b);
        if (!rect) continue;
        const smallerArea = Math.min(
          a.geometry.width * a.geometry.height,
          b.geometry.width * b.geometry.height,
        );
        if (smallerArea <= 0) continue;
        const fraction = (rect.width * rect.height) / smallerArea;
        const covered = [a, b].filter((node) => coversTextCenter(node, rect));
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

    const chips = document.connections
      .map((edge) => chipFor(edge, document, context?.canvasStyle))
      .filter((chip): chip is Chip => chip !== undefined);

    // 2 — chip vs box: a chip over any box's face. Its own endpoints count
    // too: a chip on its own endpoint hides that box's text just the same.
    for (const chip of chips) {
      for (const node of boxes) {
        const boxRect = rectOf(node);
        if (!intersects(chip.rect, boxRect)) continue;
        const own = node.id === chip.edge.from.objectId || node.id === chip.edge.to.objectId;
        if (own && chip.edge.from.objectId === chip.edge.to.objectId) continue; // a self-loop is broken-edges'
        const severity = chipFindingSeverity(chip, (rect) => intersects(rect, boxRect), "error");
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
