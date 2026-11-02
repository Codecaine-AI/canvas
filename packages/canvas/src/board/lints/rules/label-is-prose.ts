/**
 * label-is-prose — a shape, icon, or section name must read as a name, not
 * prose (warning tier).
 *
 * Measures every non-empty name with the shared text convention
 * (../../text-rules): past NAME_MAX_WORDS words or NAME_MAX_CHARS characters,
 * a sentence break, or a line break is prose. Stickies are deliberately
 * skipped — a sticky's markdown body is where prose belongs — and
 * connections are never scanned: an edge's label has unreadable-labels.
 *
 * Only names the AGENT wrote this session are judged (../authorship): an
 * object it created, or one whose name it changed. A person's own name is
 * left alone, however long — it is theirs to keep.
 */
import { kindOf } from "../../helpers";
import { agentWrote } from "../authorship";
import { DETAIL_MAX_CHARS, NAME_MAX_CHARS, NAME_MAX_WORDS, nameProseReasons } from "../../text-rules";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `A shape, icon, or section name is read at a glance, so it must stay a name, not prose:
- this warning fires when a name the agent wrote this session — on an object it created, or a
  name it changed — runs past ${NAME_MAX_WORDS} words or ${NAME_MAX_CHARS} characters, holds a sentence
  break, or breaks onto a second line; a person's unchanged names, sticky bodies (markdown), and
  edge labels are out of scope;
- the renderer gives the name one slot and its detail one muted line, so prose in a shape, an
  icon, or a section header wraps, clips, and buries the structure the diagram exists to show;
- shorten the name with update_text, move ONE fact — a port, path, version, model, or host —
  into its detail (≤ ${DETAIL_MAX_CHARS} characters), and put any explanation on a sticky beside
  it with place_sticky.`;

export const rule: LayoutRule = {
  id: "label-is-prose",
  title: "Prose in a name",
  tier: "warning",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const wroteName = agentWrote(context, "text");

    for (const object of document.objects) {
      if (kindOf(object) === "sticky" || typeof object.text !== "string") continue;
      if (!wroteName(object)) continue;
      const reasons = nameProseReasons(object.text);
      if (reasons.length === 0) continue;

      findings.push({
        rule: "label-is-prose",
        severity: "warning",
        at: [object.id],
        where: rectOf(object),
        message:
          `${object.id}'s name has ${reasons.join(", ")} — a name is one line of `
          + `≤ ${NAME_MAX_WORDS} words and ≤ ${NAME_MAX_CHARS} chars, no sentences`,
        suggestion:
          `update_text ${object.id} with a short name and one fact in detail (≤ ${DETAIL_MAX_CHARS} chars); `
          + "put the explanation on a sticky beside it with place_sticky",
      });
    }

    return findings;
  },
};
