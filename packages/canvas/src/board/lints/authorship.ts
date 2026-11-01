/**
 * Authorship for the text-convention lints: which names and details the agent
 * wrote this session.
 *
 * label-is-prose and detail-too-long judge the AGENT's writing, never a
 * person's. Every other rule judges the board as it stands — a clipped label
 * or a crossed wire is a defect whoever made it — but a long name or a wordy
 * detail the person wrote is their choice, and flagging it would push the
 * agent (and a committed finalize, which blocks on every scoped warning) into
 * rewriting labels nobody asked it to touch. So a field counts as written by
 * the agent when its object is absent from the session's starting board, or
 * when that field differs from the starting board's value; an unchanged field
 * on a pre-existing object is the person's and is never judged.
 */
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import type { LintContext } from "./types";

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
