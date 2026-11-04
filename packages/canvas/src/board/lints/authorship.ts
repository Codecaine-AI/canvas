/**
 * Authorship for the lints that judge choices, not defects: which names,
 * details, wires and placements the agent made this session.
 *
 * label-is-prose, detail-too-long and dense-note judge the AGENT's writing,
 * never a person's; wire-to-section and long-wire judge the wires the agent
 * drew or the boxes it moved. A clipped label or a crossed wire is a defect
 * whoever made it and the geometry rules judge the board as it stands, but a
 * wordy detail, a wire to a frame or a long return the person drew is their
 * choice, and flagging it would push the agent (and a committed finalize,
 * which blocks on every scoped warning) into rewriting or moving things
 * nobody asked it to touch. So a field counts as written by the agent when
 * its object is absent from the session's starting board or that field
 * differs from the starting value; a wire counts as the agent's when it is
 * absent or either end moved to another object; a box counts as moved when
 * it is absent or its geometry changed. Without a baseline nothing is
 * attributable, and every answer is no.
 */
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";

import type { LintContext } from "./types";

/** A predicate for one check pass: did the agent draw this wire, or re-end it, this session? */
export function agentWired(context: LintContext | undefined): (edge: InteractiveCanvasConnection) => boolean {
  const baseline = context?.baseline;
  if (baseline === undefined) return () => false;
  const before = new Map(baseline.connections.map((edge) => [edge.id, edge]));
  return (edge) => {
    const previous = before.get(edge.id);
    return previous === undefined
      || previous.from.objectId !== edge.from.objectId
      || previous.to.objectId !== edge.to.objectId;
  };
}

/** A predicate for one check pass: did the agent place this box, or move or resize it, this session? */
export function agentMoved(context: LintContext | undefined): (object: InteractiveCanvasObject) => boolean {
  const baseline = context?.baseline;
  if (baseline === undefined) return () => false;
  const before = new Map(baseline.objects.map((object) => [object.id, object]));
  return (object) => {
    const previous = before.get(object.id);
    if (previous === undefined) return true;
    const was = previous.geometry;
    const now = object.geometry;
    return was.x !== now.x || was.y !== now.y || was.width !== now.width || was.height !== now.height;
  };
}

/** The text fields the authorship rules judge. */
export type AuthoredField = "text" | "detail";

/**
 * A predicate for one check pass: did the agent write `field` on this object?
 * Built once per check so the baseline lookup is a map, not a scan per object.
 * Without a baseline nothing is attributable to the agent, so every answer is
 * no — the rules that use this stay silent rather than judge a person's text.
 */
export function agentWrote(
  context: LintContext | undefined,
  field: AuthoredField,
): (object: InteractiveCanvasObject) => boolean {
  const baseline = context?.baseline;
  if (baseline === undefined) return () => false;
  const before = new Map(baseline.objects.map((object) => [object.id, object]));
  return (object) => {
    const previous = before.get(object.id);
    return previous === undefined || (previous[field] ?? "") !== (object[field] ?? "");
  };
}
