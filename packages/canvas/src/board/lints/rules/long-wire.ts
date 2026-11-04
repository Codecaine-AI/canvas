/**
 * long-wire — a wire the agent drew, or whose end it placed, runs more than
 * half the board (warning tier).
 *
 * Layout & flow is scored on short wires: the judges' anchor for 9 to 10 is
 * "short straight wires", and over the 24 scored climb boards of medium
 * rounds 0 to 3 the total routed wire length predicts the layout score at
 * r = -0.87, a relation that held on the high-effort round 0 it was not fit
 * to (12300px of wire scored 7, 18000px and up scored 4 to 5). On every one
 * of those six boards the judges named the board's longest wire: "runs back
 * across the whole board", "climbs the full board height", "runs about 650px
 * right under AI self-service". No rule measured length; wire-detour catches
 * only a wire that leaves its two owners' box.
 *
 * A wire is long relative to what the viewer sees: its routed length past
 * LONG_WIRE_SHARE of the board's longer painted edge, and past LONG_WIRE_MIN_PX
 * so a small board is not judged on its every wire. At half the edge the rule
 * marks the wires the judges named on the high round 0 boards (one to five
 * per board) and few others. The fix is placement, as for wire-detour: bring
 * the two ends together, or the two sections that hold them.
 *
 * Only the agent's work is judged (../authorship): a wire it drew or re-ended
 * this session, or one whose end it placed or moved. The reference corpus of
 * people's boards holds 16 such wires, and a person's long return is theirs
 * to keep; without a baseline the rule stays silent.
 */
import { boundsForGeometries } from "../../../state/geometry";
import { pageFrameOf } from "../../helpers";
import { agentMoved, agentWired } from "../authorship";
import { routedPolyline, type Point } from "../geometry";

import type { InteractiveCanvasDocument } from "../../../state/schema";
import type { LayoutRule } from "../types";

/** Share of the board's longer painted edge past which a wire reads as long. */
const LONG_WIRE_SHARE = 0.5;
/** Shortest routed length that can read as long, so a small board's wires pass. */
const LONG_WIRE_MIN_PX = 600;

const GUIDANCE = `A viewer follows a short wire and loses a long one, so a wire never runs more than half the board:
- this warning fires when a wire the agent drew, or whose end it placed, runs past
  ${Math.round(LONG_WIRE_SHARE * 100)}% of the board's longer painted edge (and past ${LONG_WIRE_MIN_PX}px) on its drawn
  route, stubs, elbows and waypoints included; a person's unchanged wires are out of scope;
- total wire length is what a viewer reads as layout, and the longest wires are the returns,
  retries and fallbacks drawn against the main flow;
- fix it by placement: move_to the node that receives the wire beside the node that sends it, or
  move_to the two sections that hold them next to each other, so a return runs a short way along
  the near side of the flow; a waypoint cannot shorten it, and tighten_wires reports the total.`;

function routedLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return total;
}

export const rule: LayoutRule = {
  id: "long-wire",
  title: "Long wire",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument, context) {
    const frameId = pageFrameOf(document)?.id ?? null;
    const painted = boundsForGeometries(
      document.objects.filter((object) => object.id !== frameId).map((object) => object.geometry),
    );
    if (!painted) return [];
    const edge = Math.max(painted.width, painted.height);
    const limit = Math.max(LONG_WIRE_MIN_PX, LONG_WIRE_SHARE * edge);
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    const wired = agentWired(context);
    const moved = agentMoved(context);
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const wire of document.connections) {
      const from = byId.get(wire.from.objectId);
      const to = byId.get(wire.to.objectId);
      if (!from || !to) continue;
      if (!wired(wire) && !moved(from) && !moved(to)) continue;
      const points = routedPolyline(wire, document, context?.canvasStyle);
      if (points.length < 2) continue;
      const length = routedLength(points);
      if (length <= limit) continue;
      findings.push({
        rule: "long-wire",
        severity: "warning",
        at: [wire.id, from.id, to.id],
        message: `${wire.id} runs ${Math.round(length)}px, ${Math.round((100 * length) / edge)}% of the board's `
          + `${Math.round(edge)}px longer edge — a viewer loses a wire past half the board`,
        suggestion: `move_to ${to.id} beside ${from.id}, or the two sections that hold them `
          + "next to each other, so the wire runs a short way along the near side of the flow; a waypoint cannot shorten it",
      });
    }
    return findings;
  },
};
