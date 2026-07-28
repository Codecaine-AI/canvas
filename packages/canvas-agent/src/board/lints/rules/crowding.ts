/**
 * crowding — sibling nodes need enough clearance for routed wires and their
 * labels to pass between them (warning tier).
 */
import { kindOf } from "../../helpers";
import { axisGap } from "../../measure";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** Minimum horizontal gap between side-by-side siblings; a vertical wire and
 *  its label must fit in the corridor between them. */
const MIN_HORIZONTAL_GAP = 80;
/**
 * Minimum vertical gap between stacked siblings. Lower than its horizontal
 * counterpart because a wire between stacked peers usually runs along the gap
 * rather than across it — they are typically the pair the wire connects — and
 * because deliberate pairings like a label above its content sit close on
 * purpose. This is the clearance below which a route cannot pass, not a
 * preferred distance.
 */
const MIN_VERTICAL_GAP = 48;

type Rect = InteractiveCanvasObject["geometry"];

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

const GUIDANCE = `Sibling nodes pressed close enough that a routed wire and its label cannot pass
through the corridor between them:
- side-by-side siblings need ≥${MIN_HORIZONTAL_GAP}px between their boxes, and stacked siblings
  need ≥${MIN_VERTICAL_GAP}px;
- diagonal pairs have open routing space and are out of scope; truly overlapping pairs are
  also out of scope because covered-content owns that error;
- these are the clearances a route physically needs. The spacing a composition
  aims for is a separate question, and the system prompt answers it.`;

export const rule: LayoutRule = {
  id: "crowding",
  title: "Crowding",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const nodes = document.objects.filter((object) => kindOf(object) === "node");

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]!;
        if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;

        const xGap = axisGap(a.geometry, b.geometry, "x");
        const yGap = axisGap(a.geometry, b.geometry, "y");
        const xOverlap = xGap < 0;
        const yOverlap = yGap < 0;

        if (xOverlap && yOverlap) continue;

        let gap: number;
        let axis: "horizontal" | "vertical";
        let threshold: number;
        if (yOverlap && !xOverlap) {
          gap = xGap;
          axis = "horizontal";
          threshold = MIN_HORIZONTAL_GAP;
        } else if (xOverlap && !yOverlap) {
          gap = yGap;
          axis = "vertical";
          threshold = MIN_VERTICAL_GAP;
        } else {
          continue;
        }
        if (gap >= threshold) continue;

        const roundedGap = Math.round(gap);
        findings.push({
          rule: "crowding",
          severity: "warning" as const,
          at: [a.id, b.id],
          where: unionRect(a.geometry, b.geometry),
          message: axis === "horizontal"
            ? `${a.id} and ${b.id} sit ${roundedGap}px apart side by side where wires and labels need ≥${MIN_HORIZONTAL_GAP}px of corridor to route between them`
            : `${a.id} and ${b.id} sit ${roundedGap}px apart stacked where wires and labels need ≥${MIN_VERTICAL_GAP}px of corridor to route between them`,
          suggestion: `open the ${a.id}↔${b.id} corridor to ≥${threshold}px`,
        });
      }
    }

    return findings;
  },
};
