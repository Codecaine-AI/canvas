/**
 * The one-line `detail` at the tool boundary — how a gesture stores it and
 * what it says when the target cannot carry one.
 *
 * The document rule (packages/canvas/src/state/schema/validate.ts) is: shapes,
 * icons, and sections carry an optional detail; it is trimmed, an empty one is
 * no detail at all, and a sticky never carries one. The gestures write by the
 * same rule, so an agent-written draft and the file it is saved to never
 * disagree about a detail (a mismatch would surface as a persist residual).
 */

/** A detail as the document stores it: trimmed, and absent when empty. */
export function storedDetail(detail: string | undefined): string | undefined {
  const trimmed = detail?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The note for a detail sent to a kind that has no detail line. A detail on a
 * sticky or an edge is dropped and the call says so — the rest of the gesture
 * still applies, the way change_shape drops a direction a type cannot hold.
 */
export function detailDroppedNote(kind: "sticky" | "edge"): string {
  return kind === "sticky"
    ? "detail dropped — a sticky has no detail line; its markdown body is the whole note"
    : "detail dropped — an edge has no detail line; its label is its only text";
}
