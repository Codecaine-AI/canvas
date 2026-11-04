/**
 * dense-note — a sticky note holds a few lines a viewer reads at a glance,
 * not the system's rules in prose (warning tier).
 *
 * A note past NOTE_MAX_WORDS words (../../text-rules) is a wall of text: it
 * renders at the same weight as the diagram, and the rules inside it (a
 * retry, a failure path, a limit) are never drawn. The fix is to draw each
 * rule as a labeled wire, branch or node, then cut the note to what the
 * wires cannot show.
 *
 * Only notes the AGENT wrote this session are judged (../authorship), as
 * label-is-prose judges names: a person's own note is theirs to keep.
 */
import { kindOf } from "../../helpers";
import { agentWrote } from "../authorship";
import { NOTE_MAX_WORDS, wordCount } from "../../text-rules";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `A sticky note is read at a glance beside its subject, so it must stay short:
- this warning fires when a note the agent wrote this session runs past ${NOTE_MAX_WORDS} words;
  a person's unchanged notes, names and wire labels are out of scope;
- a long note carries the system's rules as prose at the weight of the diagram, and the
  retries, failure paths and limits inside it are never drawn;
- draw each rule as a labeled wire, branch or node with connect and place_shape, then
  update_text the note down to what the wires cannot show, or split it into notes beside
  each subject.`;

export const rule: LayoutRule = {
  id: "dense-note",
  title: "Dense note",
  tier: "warning",
  guidance: GUIDANCE,
  check(document, context) {
    const wroteText = agentWrote(context, "text");
    return document.objects
      .filter((object) => kindOf(object) === "sticky" && typeof object.text === "string" && wroteText(object))
      .map((object) => ({ object, words: wordCount(object.text ?? "") }))
      .filter(({ words }) => words > NOTE_MAX_WORDS)
      .map(({ object, words }) => ({
        rule: "dense-note",
        severity: "warning" as const,
        at: [object.id],
        where: rectOf(object),
        message: `${object.id} note has ${words} words — a note holds ≤ ${NOTE_MAX_WORDS}`,
        suggestion:
          "draw each rule it states (a retry, a failure path, a limit) as a labeled wire, branch or node "
          + `with connect or place_shape, then update_text ${object.id} down to what the wires cannot show`,
      }));
  },
};
