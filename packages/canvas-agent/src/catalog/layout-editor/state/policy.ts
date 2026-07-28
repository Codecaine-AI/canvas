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
/** Applied-operation lines rendered into <recent_ops>. */
export const OPS_SHOWN = 12;
/** View refs kept in S. */
export const VIEW_REFS_LIMIT = 12;
/** Current board plus the three immediately prior changes attached by state. */
export const VIEWS_ATTACHED = 4;
/** Steering messages retained verbatim, so a short tail cannot lose the ask. */
export const INSTRUCTIONS_KEPT = 5;
/**
 * Real transcript messages re-emitted after the state block, hard-capped.
 * The state block carries the working picture and <recent_ops> the durable history,
 * so the tail only needs enough for the model to read its own recent results —
 * and once the one-call cadence holds, an uncapped tail would grow with every
 * turn of a long run.
 */
export const TAIL_MESSAGES = 12;
/** Longest tool-result headline kept on an op line. */
export const OP_SUMMARY_CHARS = 160;
