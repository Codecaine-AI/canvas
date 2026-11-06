/**
 * integrity — the defects the automatic fixes exist to prevent, found where
 * something bypassed them (error tier).
 *
 * The MCP tools grow nodes to fit their text, grow sections to hold their
 * children, refuse broken wires, and route around boxes. A Studio edit, a
 * file written by an older build, or a route with no clear path can still
 * leave one of these behind, so this rule reports what is definitely wrong
 * on the board as it stands, with no margins and no near misses:
 * - a box (shape or icon) whose name or detail definitely overflows it: the
 *   textFitReport "overflows" verdict, definite. Stickies and sections do
 *   not auto-size; canvas_check's TEXT note names theirs;
 * - a child extending outside its section's rect;
 * - a self-loop, dangling or zero-length wire (wire-integrity.ts);
 * - a wire whose drawn route runs through a box other than its ends, judged
 *   by the router's own check (routeThroughBoxIds), so lint and router agree.
 */
import { routeThroughBoxIds } from "../../../connectors/routing";
import { childrenOf, kindOf } from "../../helpers";
import { textFitReport, type TextFitReport } from "../../text-fit";
import { brokenWires } from "../../wire-integrity";
import { rectOf } from "../geometry";

import type { InteractiveCanvasObject } from "../../../state/schema";
import type { LayoutRule } from "../types";

const GUIDANCE = `Integrity fires only when something bypassed the automatic fixes (a Studio edit,
an older file, a route with no clear path). Blocking (error tier):
- a box whose text overflows it — resize it to the size the finding names;
- a child outside its section — move_to it back inside, or resize the section;
- a self-loop, dangling or zero-length wire — delete it, or reconnect it with change_connection;
- a wire drawn through a box because no clear route exists — move_to the box or an end so a path opens.`;

/** The remedy for an overflow, worded for what clipped: the name, the detail line, or both. */
function textFix(id: string, report: TextFitReport): string {
  const needed = report.neededSize;
  const grow = needed ? `resize ${id} to ≥${needed.width}×${needed.height}` : undefined;
  const line = report.detailLine;
  if (line === undefined || (line.shown && !line.truncated)) return grow ?? `shorten ${id}'s text`;
  if (!line.shown) return grow ? `${grow} so the detail fits under the name, or clear the detail` : `clear ${id}'s detail`;
  return grow ?? `shorten ${id}'s detail to ≤${line.fittingChars} chars`;
}

/** How far `inner` reaches past `outer`'s rect on its worst side (≤ 0 when inside). */
function overflowPast(inner: InteractiveCanvasObject, outer: InteractiveCanvasObject): number {
  const a = inner.geometry;
  const b = outer.geometry;
  return Math.max(b.x - a.x, b.y - a.y, a.x + a.width - (b.x + b.width), a.y + a.height - (b.y + b.height));
}

const round = (value: number) => Math.round(value * 100) / 100;

const WIRE_FIX: Record<ReturnType<typeof brokenWires>[number]["kind"], (id: string) => string> = {
  "self-loop": (id) => `delete ${id}; put the self-transition in the node's text`,
  dangling: (id) => `delete ${id}, or reconnect it with change_connection`,
  "zero-length": (id) => `move_to one end of ${id} clear of the other, or delete ${id}`,
};

export const rule: LayoutRule = {
  id: "integrity",
  title: "Integrity",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const canvasStyle = context?.canvasStyle;

    // Text that overflows a box. Nodes auto-size, so this is a bypass.
    for (const object of document.objects) {
      if (kindOf(object) !== "node") continue;
      const text = object.text ?? "";
      if (text === "" && !object.detail?.trim()) continue;
      const report = textFitReport(object, object.geometry, text, canvasStyle);
      if (report.verdict !== "overflows" || !report.definite) continue;
      findings.push({
        rule: "integrity",
        severity: "error",
        at: [object.id],
        where: rectOf(object),
        message: `${object.id}'s text overflows its box: ${report.detail}`,
        suggestion: textFix(object.id, report),
      });
    }

    // A child outside its section. Sections grow to hold children, so this is a bypass.
    for (const section of document.objects.filter((object) => kindOf(object) === "section")) {
      for (const child of childrenOf(document, section.id)) {
        const overflow = overflowPast(child, section);
        if (!Number.isFinite(overflow) || !(overflow > 0)) continue;
        findings.push({
          rule: "integrity",
          severity: "error",
          at: [child.id, section.id],
          where: rectOf(child),
          message: `${child.id} extends ${round(overflow)}px outside its section ${section.id}`,
          suggestion: `move_to ${child.id} back inside ${section.id}, or resize ${section.id} to hold it`,
        });
      }
    }

    // Wires no edit may make.
    const broken = brokenWires(document);
    for (const wire of broken) {
      const edge = document.connections.find((connection) => connection.id === wire.id)!;
      findings.push({
        rule: "integrity",
        severity: "error",
        at: [wire.id, edge.from.objectId, edge.to.objectId].filter((id, index, ids) => ids.indexOf(id) === index),
        message: wire.text,
        suggestion: WIRE_FIX[wire.kind](wire.id),
      });
    }

    // A route drawn through a box: the router found no clear path.
    const brokenIds = new Set(broken.map((wire) => wire.id));
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    for (const edge of document.connections) {
      if (brokenIds.has(edge.id)) continue;
      const from = byId.get(edge.from.objectId)!;
      const to = byId.get(edge.to.objectId)!;
      const through = routeThroughBoxIds(from, to, edge, document.objects, canvasStyle);
      if (through.length === 0) continue;
      findings.push({
        rule: "integrity",
        severity: "error",
        at: [edge.id, ...through],
        message: `wire ${edge.id} (${from.id}→${to.id}) is drawn through ${through.join(", ")}: no clear route exists`,
        suggestion: `move_to ${through.join(" or ")} out of the way so a clear path opens`,
      });
    }

    return findings;
  },
};
