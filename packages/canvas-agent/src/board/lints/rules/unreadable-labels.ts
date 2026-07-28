/**
 * unreadable-labels — the rendered chip does not fit where it renders
 * (warning tier).
 *
 * The chip judged here is the renderer's actual chip — metrics and placement
 * from lints/geometry.ts, parity-pinned to the renderer by
 * test/lints-chip-parity.test.ts. Inflate it by the 16px breathing margin
 * and fire when that rect bleeds onto an endpoint box of the chip's own
 * edge. Chips hitting OTHER boxes, chips, or wires are covered-content's
 * findings.
 */
import {
  CHIP_CLEARANCE,
  chipFor,
  inflate,
  intersects,
  rectOf,
  type Chip,
  type Rect,
} from "../geometry";
import { kindOf } from "../../helpers";
import { axisGap, type Axis } from "../../measure";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** The axis the edge runs along: whichever separates the endpoints more. */
function runAxis(from: InteractiveCanvasObject, to: InteractiveCanvasObject): Axis {
  return axisGap(rectOf(from), rectOf(to), "x") >= axisGap(rectOf(from), rectOf(to), "y")
    ? "x"
    : "y";
}

interface ChipFitFinding {
  edge: InteractiveCanvasConnection;
  chip: Chip;
  from: InteractiveCanvasObject;
  to: InteractiveCanvasObject;
  /** Endpoint boxes the margin-inflated chip bleeds onto. */
  hits: InteractiveCanvasObject[];
  axis: Axis;
  /** Measured corridor between the endpoint rects along the run axis. */
  available: number;
  /** Chip extent along the run axis plus a breathing margin on each side. */
  needed: number;
}

function chipFitFinding(
  edge: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
): ChipFitFinding | undefined {
  if (edge.from.objectId === edge.to.objectId) return undefined;
  const chip = chipFor(edge, document);
  if (!chip) return undefined;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const from = byId.get(edge.from.objectId);
  const to = byId.get(edge.to.objectId);
  if (!from || !to) return undefined;
  const inflated = inflate(chip.rect, CHIP_CLEARANCE);
  const hits = [from, to].filter(
    (endpoint) => kindOf(endpoint) !== "section" && intersects(inflated, rectOf(endpoint)),
  );
  if (hits.length === 0) return undefined;
  const axis = runAxis(from, to);
  const available = axisGap(rectOf(from), rectOf(to), axis);
  const extent = axis === "x" ? chip.rect.width : chip.rect.height;
  return {
    edge, chip, from, to, hits, axis,
    available: Math.max(0, available),
    needed: extent + CHIP_CLEARANCE * 2,
  };
}

const GUIDANCE = `A labeled edge renders a fixed-size chip at its route's midpoint, and that chip must fit:
- when the chip plus its ${CHIP_CLEARANCE}px breathing margin bleeds onto one of its own endpoint
  boxes, the label is physically unreadable;
- open the corridor by moving one endpoint box along the run axis until the gap clears
  the chip and both margins, reroute, or shorten the label until the rendered chip fits.`;

export const rule: LayoutRule = {
  id: "unreadable-labels",
  title: "Unreadable labels",
  tier: "warning",
  guidance: GUIDANCE,
  check(document) {
    return document.connections
      .map((edge) => chipFitFinding(edge, document))
      .filter((finding): finding is ChipFitFinding => finding !== undefined)
      .map((finding) => ({
        rule: "unreadable-labels",
        severity: "warning" as const,
        at: [finding.edge.id, ...finding.hits.map((endpoint) => endpoint.id)],
        where: finding.chip.rect,
        message: `label "${finding.chip.label}" chip on ${finding.edge.id} `
          + `(${Math.round(finding.chip.rect.width)}×${Math.round(finding.chip.rect.height)}px) `
          + `bleeds onto ${finding.hits.map((endpoint) => endpoint.id).join(" and ")}: `
          + `${Math.round(finding.available)}px of corridor where the chip needs ${Math.ceil(finding.needed)}px`,
        suggestion: `open the ${finding.from.id}↔${finding.to.id} corridor to `
          + `≥${Math.ceil(finding.needed)}px so the chip and its ${CHIP_CLEARANCE}px margins fit`,
      }));
  },
};
