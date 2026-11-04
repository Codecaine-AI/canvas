/**
 * wire-detour — a wire runs around or through a section that owns neither of
 * its ends (error tier).
 *
 * The layout guidance says it in prose: place the two ends near each other,
 * never route a wire around a third section, and move a node instead of
 * adding waypoints. Climb rounds 1 and 2 showed the drawer does not act on
 * the prose, while it clears every lint error. So the rule is a check.
 *
 * Measured on the renderer's true polyline (anchors, endpoint positions and
 * waypoints included), so a waypoint cannot hide a detour:
 * - around: the drawn route runs ≥100px outside the box that spans the two
 *   ends' top-level sections (a same-section wire: outside its own section).
 *   A 24px anchor stub is not a detour; a run down a board edge is;
 * - through: the drawn route runs ≥40px inside a top-level section that is
 *   an ancestor of neither end.
 *
 * Top-level means a child of the page frame (or a root section when the
 * board has no frame). Nested sections count through their top-level owner,
 * so a wire between two sub-sections of one region is judged inside that
 * region. An end that sits directly on the page frame has no owner, and the
 * rule is silent for that wire: there is no box to leave.
 */
import { kindOf, pageFrameOf } from "../../helpers";
import { inflate, polylineLengthInRect, routedPolyline, type Point, type Rect } from "../geometry";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../state/schema";
import type { LayoutRule, LintContext } from "../types";

/** Slack around the two owners' box before a run outside it counts. */
const OUTSIDE_MARGIN = 8;
/** Shortest run outside the owners' box that reads as a detour, not a stub. */
const AROUND_RUN = 100;
/** Shortest run inside a third section that reads as crossing it. */
const THROUGH_RUN = 40;

const GUIDANCE = `A wire that runs around or through a section owning neither of its ends is a layout fault, not a routing one:
- judged on the drawn route, waypoints included, so reroute and shift_segment cannot clear it;
- around: the route runs ${AROUND_RUN}px or more outside the box spanning its two ends' top-level sections (a 24px anchor stub never counts);
- through: the route runs ${THROUGH_RUN}px or more inside a top-level section that holds neither end;
- the fix is placement: move_to the node that receives the wire beside the node that sends it, or move_to the two sections next to each other so the wire runs between them;
- a section placed between two sections it does not connect is the usual cause — reorder the sections along the main flow.`;

type Owner = { object: InteractiveCanvasObject; rect: Rect };

/** The top-level section holding `id`: the ancestor directly under the page frame (or the root ancestor without one). */
function topLevelOwner(
  id: string,
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
  frameId: string | null,
): InteractiveCanvasObject | null {
  let owner: InteractiveCanvasObject | null = null;
  let current = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current);
    if (!parent) break;
    if (parent.id === frameId) break;
    if (kindOf(parent) === "section") owner = parent;
    current = parent.parentId ?? null;
  }
  return owner;
}

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

function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return length;
}

function directRun(points: readonly Point[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
}

export const rule: LayoutRule = {
  id: "wire-detour",
  title: "Wire detour",
  tier: "error",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument, context?: LintContext) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    const frame = pageFrameOf(document);
    const frameId = frame?.id ?? null;
    const topLevel = document.objects.filter((object) =>
      kindOf(object) === "section" && object.id !== frameId && (object.parentId ?? null) === frameId);

    for (const edge of document.connections) {
      if (edge.from.objectId === edge.to.objectId) continue;
      const from = byId.get(edge.from.objectId);
      const to = byId.get(edge.to.objectId);
      if (!from || !to) continue;
      // A top-level section endpoint owns itself: a wire to a region is judged
      // against that region. A nested one counts through its top-level owner.
      const ownerOf = (object: InteractiveCanvasObject): Owner | null => {
        const section = topLevelOwner(object.id, byId, frameId)
          ?? (kindOf(object) === "section" && object.id !== frameId ? object : null);
        return section ? { object: section, rect: section.geometry } : null;
      };
      const fromOwner = ownerOf(from);
      const toOwner = ownerOf(to);
      if (!fromOwner || !toOwner) continue;

      const points = routedPolyline(edge, document, context?.canvasStyle);
      if (points.length < 2) continue;
      const total = polylineLength(points);
      const direct = directRun(points);
      const owners = unionRect(fromOwner.rect, toOwner.rect);
      const ownerIds = new Set([fromOwner.object.id, toOwner.object.id]);

      const crossed = topLevel
        .filter((section) => !ownerIds.has(section.id))
        .map((section) => ({ section, run: polylineLengthInRect(points, inflate(section.geometry, -0.5)) }))
        .filter(({ run }) => run >= THROUGH_RUN);
      for (const { section, run } of crossed) {
        findings.push({
          rule: "wire-detour",
          severity: "error",
          at: [edge.id, section.id],
          where: section.geometry,
          message: `${edge.id} runs ${Math.round(run)}px through ${section.id}, which holds neither ${from.id} nor ${to.id}`,
          suggestion: `move ${to.id} beside ${from.id}, or move ${section.id} out from between ${fromOwner.object.id} and ${toOwner.object.id}; a waypoint cannot clear this`,
        });
      }

      const outside = total - polylineLengthInRect(points, inflate(owners, OUTSIDE_MARGIN));
      if (outside < AROUND_RUN) continue;
      const crossedIds = new Set(crossed.map(({ section }) => section.id));
      const bypassed = topLevel.filter((section) =>
        !ownerIds.has(section.id) && !crossedIds.has(section.id) && rectsOverlap(section.geometry, owners));
      const around = bypassed.length > 0 ? bypassed.map((section) => section.id).join(", ") : null;
      const placement = fromOwner.object.id === toOwner.object.id
        ? `leaves ${fromOwner.object.id}`
        : around
          ? `runs around ${around}`
          : `runs outside ${fromOwner.object.id} and ${toOwner.object.id}`;
      findings.push({
        rule: "wire-detour",
        severity: "error",
        at: [edge.id, ...bypassed.map((section) => section.id)],
        where: owners,
        message: `${edge.id} ${placement} for ${Math.round(outside)}px (${Math.round(total)}px of wire for a ${Math.round(direct)}px direct run)`,
        suggestion: fromOwner.object.id === toOwner.object.id
          ? `move ${to.id} beside ${from.id} inside ${fromOwner.object.id} so the wire stays in its section; a waypoint cannot clear this`
          : `move ${to.id} beside ${from.id}, or set ${toOwner.object.id} next to ${fromOwner.object.id} so the wire runs between them; a waypoint cannot clear this`,
      });
    }
    return findings;
  },
};

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
