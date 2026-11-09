/**
 * detail-value — a node detail Jev judged to carry no fact (error tier).
 *
 * The rule never calls the network. canvas_check asks Jev about every node
 * detail (board/detail-value: one Choice question per detail, cached by what
 * the question saw) and stores the verdicts on the session; this rule reads
 * them from the lint context. A detail with no verdict yet, a `keep`, or a
 * `remove` below DETAIL_REMOVE_THRESHOLD is no finding. A verdict is keyed by
 * everything its question saw (board title, name, detail, section, wired
 * neighbors), so editing any of them leaves the old verdict unread: the
 * finding clears at once, and the next canvas_check judges the new inputs.
 * A check that could not run leaves no verdicts, so the rule reports nothing.
 */
import { detailKey, detailSubjects, isRemoval } from "../../detail-value";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `A node's detail must state a fact its name and the board do not: a field, a
measure, a limit, a trigger, a payload, a path, a version. The board check asks
Jev whether each detail does. A detail Jev is sure adds nothing (it restates the
name, repeats the section or a neighbor, or is generic filler) blocks (error
tier) until you clear it with update_text <id> detail "".`;

export const rule: LayoutRule = {
  id: "detail-value",
  title: "Detail value",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    const verdicts = context?.detailVerdicts;
    if (!verdicts || verdicts.size === 0) return [];
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const subject of detailSubjects(document)) {
      const verdict = verdicts.get(detailKey(subject));
      if (!isRemoval(verdict)) continue;
      const object = byId.get(subject.id)!;
      findings.push({
        rule: "detail-value",
        severity: "error",
        at: [subject.id],
        where: rectOf(object),
        message: `${subject.id}'s detail ${JSON.stringify(subject.detail)} adds no fact to its name `
          + `${JSON.stringify(subject.name)} (Jev: remove, confidence ${verdict.confidence.toFixed(2)})`,
        suggestion: `update_text ${subject.id} detail ""`,
      });
    }
    return findings;
  },
};
