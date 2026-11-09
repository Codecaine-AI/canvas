/**
 * The one-line `detail` at the tool boundary — how a gesture stores it and
 * what it says when the target cannot carry one.
 *
 * The document rule (packages/canvas/src/state/schema/validate.ts) is: shapes
 * and icons carry an optional detail; it is trimmed, an empty one is no detail
 * at all, and a sticky never carries one. A section's header is its title
 * alone: no gesture writes a section detail, and one an older file still holds
 * never renders. The gestures write by the same rule, so an agent-written
 * draft and the file it is saved to never disagree about a detail (a mismatch
 * would surface as a persist residual).
 */

/** A detail as the document stores it: trimmed, and absent when empty. */
export function storedDetail(detail: string | undefined): string | undefined {
  const trimmed = detail?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The note for a detail sent to a kind that has no detail line. A detail on a
 * sticky, a section, or an edge is dropped and the call says so — the rest of
 * the gesture still applies, the way change_shape drops a direction a type
 * cannot hold.
 */
export function detailDroppedNote(kind: "sticky" | "section" | "edge"): string {
  return DETAIL_DROPPED[kind];
}

const DETAIL_DROPPED = {
  sticky: "detail dropped — a sticky has no detail line; its markdown body is the whole note",
  section: "detail dropped — a section has no detail line; its header is the title alone",
  edge: "detail dropped — an edge has no detail line; its label is its only text",
} as const;
