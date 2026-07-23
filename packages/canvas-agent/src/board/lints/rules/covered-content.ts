/**
 * covered-content — nothing may sit on content (error tier, with
 * warning-tier near-miss findings).
 *
 * Checks, all on real geometry (chips are the renderer's own chips at the
 * router's own label point):
 * - box-on-box (error): sibling boxes (same parent; sections, stickies, and
 *   annotation markers exempt) whose intersection exceeds 25% of the smaller
 *   box or covers a box's text center;
 * - chip-on-box (error) / chip-near-box (warning): a label chip over a third
 *   box's face; contact inside the 16px clearance margin is the warning;
 * - chip-on-chip (error) / chip-near-chip (warning): same margin logic;
 * - chip-on-edge (error) / chip-near-edge (warning): a chip lying along
 *   ANOTHER edge's routed wire for more than 8px.
 *
 * A chip's own edge and its endpoint boxes are not counted here — a chip
 * nosing into its endpoints is a fit matter (unreadable-labels).
 */
import {
  CHIP_CLEARANCE,
  chipFor,
  inflate,
  intersects,
  polylineLengthInRect,
  rectOf,
  routedPolyline,
  type Chip,
  type Rect,
} from "../geometry";
import { kindOf } from "../../helpers";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

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
- a label chip on a box face, on another chip, or lying along another edge's wire.
Even ${CHIP_CLEARANCE}px of kissing contact reads as merged (warning tier).
Fix it by routing around the crowd, moving the label with a waypoint, or giving the region air.
Stickies and annotation markers float above the diagram and are exempt.`;

export const rule: LayoutRule = {
  id: "covered-content",
  title: "Covered content",
  tier: "error",
  guidance: GUIDANCE,
  check(document) {
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
      .map((edge) => chipFor(edge, document))
      .filter((chip): chip is Chip => chip !== undefined);

    // 2 — chip vs box (own endpoints exempt): overlap E, 16px contact W.
    for (const chip of chips) {
      for (const node of boxes) {
        if (
          node.id === chip.edge.from.objectId
          || node.id === chip.edge.to.objectId
        ) continue;
        const boxRect = rectOf(node);
        if (intersects(chip.rect, boxRect)) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [chip.edge.id, node.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} covers ${node.id}`,
            suggestion: `route ${chip.edge.id} around ${node.id} or move the label with a waypoint`,
          });
        } else if (intersects(inflate(chip.rect, CHIP_CLEARANCE), boxRect)) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [chip.edge.id, node.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} sits within ${CHIP_CLEARANCE}px of ${node.id}`,
            suggestion: `give the chip clear air — nudge ${node.id} or reroute ${chip.edge.id}`,
          });
        }
      }
    }

    // 3 — chip vs chip: overlap E, 16px contact W.
    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i]!;
        const b = chips[j]!;
        if (intersects(a.rect, b.rect)) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [a.edge.id, b.edge.id],
            where: a.rect,
            message: `label "${a.label}" chip on ${a.edge.id} overlaps label "${b.label}" chip on ${b.edge.id}`,
            suggestion: "separate the two edges (spacing or waypoints) so both labels read",
          });
        } else if (intersects(inflate(a.rect, CHIP_CLEARANCE), b.rect)) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [a.edge.id, b.edge.id],
            where: a.rect,
            message: `label "${a.label}" chip on ${a.edge.id} sits within ${CHIP_CLEARANCE}px of label "${b.label}" chip on ${b.edge.id}`,
            suggestion: "separate the two edges so the chips read as two labels",
          });
        }
      }
    }

    // 4 — chip vs another edge's routed polyline (flowchart R1 blind spot):
    // a run of more than EDGE_RUN_TOLERANCE px through the chip is an error;
    // the same run through the 16px-inflated chip is the margin warning.
    for (const chip of chips) {
      for (const edge of document.connections) {
        if (edge.id === chip.edge.id) continue;
        const polyline = routedPolyline(edge, document);
        if (polyline.length < 2) continue;
        const rawRun = polylineLengthInRect(polyline, chip.rect);
        if (rawRun > EDGE_RUN_TOLERANCE) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [chip.edge.id, edge.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} lies on ${edge.id}'s path for ${Math.round(rawRun)}px`,
            suggestion: `move the label with a waypoint or reroute ${edge.id} so the chip owns its wire`,
          });
          continue;
        }
        const marginRun = polylineLengthInRect(polyline, inflate(chip.rect, CHIP_CLEARANCE));
        if (marginRun > EDGE_RUN_TOLERANCE) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [chip.edge.id, edge.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} sits within ${CHIP_CLEARANCE}px of ${edge.id}'s path`,
            suggestion: `offset ${edge.id} or move the label so it cannot read as ${edge.id}'s label`,
          });
        }
      }
    }

    return findings;
  },
};
