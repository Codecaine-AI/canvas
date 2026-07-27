/**
 * How much of the work log the state keeps, and how much of it the request
 * shows. Two different questions, so two different numbers per concern: the
 * `_LIMIT` caps bound what `S` carries across a long run (it is snapshotted to
 * state.json every turn), the others bound what section ③ spends tokens on.
 *
 * Everything here is read by both ../rules (what to keep) and ../render (what
 * to show), which is why it is neither's file.
 */

/** Applied-operation lines kept in S. Older lines fall off the front. */
export const OPS_LOG_LIMIT = 120;
/** Applied-operation lines rendered into <ops>. */
export const OPS_SHOWN = 12;
/** View refs kept in S. */
export const VIEW_REFS_LIMIT = 12;
/** Rendered views attached as images by the state block. */
export const VIEWS_ATTACHED = 3;
/** Steering messages retained verbatim, so a short tail cannot lose the ask. */
export const INSTRUCTIONS_KEPT = 5;
/** Longest tool-result headline kept on an op line. */
export const OP_SUMMARY_CHARS = 160;
