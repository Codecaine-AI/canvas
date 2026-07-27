/**
 * The layout tool runtime — the harness handle bound to the layout-editor
 * agent's private tools/ sidecar at spawn time.
 *
 * Each mutation call handles one operation, individually validating, applying,
 * and reporting it. Its result is sized to that operation: the APPLIED line,
 * what changed, the lint delta, digest rows for the affected region, and a
 * render only when the call requested one. The deliberate perception call
 * returns the whole board, the cumulative diff, the full lint list, and the
 * board render. The session tools manage the annotation-thread queue and end
 * the run.
 *
 * Each method resolves "which layout session am I?" internally through the
 * kernel run context (containerId → session), so the tool sidecar stays a
 * thin schema + dispatch layer.
 */

export interface LayoutToolTextResult {
  text: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface LayoutToolRenderResult extends LayoutToolTextResult {
  /**
   * Render payloads from perception. An operation result includes the requested
   * section render only when `view` was supplied; the deliberate perception
   * call includes the whole-board render. Absent on errors and whenever the
   * call produces no render.
   */
  pngs?: Buffer[];
}

export interface LayoutToolRuntime {
  /**
   * Run one named operation against the current draft. `params` carries that
   * operation's own arguments, including the optional `view` naming a section
   * for a close-up alongside the result.
   */
  operation(name: string, params: Record<string, unknown>): LayoutToolRenderResult;
  /**
   * Read the board without changing it: the whole digest, the cumulative diff,
   * every open finding, and the board render. `view` optionally names a
   * section for a close-up as well.
   */
  look(view?: string): LayoutToolRenderResult;
  /**
   * Replace the board's standing markdown account of what it represents, its
   * pieces, and how it reads.
   */
  updateDescription(description: string): LayoutToolTextResult;
  /**
   * Open an agent-authored annotation thread on one object: a question left
   * for the user, which never blocks the run.
   */
  addAnnotation(objectId: string, body: string): LayoutToolTextResult;
  /** Dispose one user-request queue entry (done/declined + note). */
  resolveRequest(
    id: string,
    status: "done" | "declined",
    note: string,
  ): LayoutToolTextResult;
  /**
   * End the run: `committed` proposes the draft (gated on error-tier lints
   * and open requests), `none` ends without a proposal.
   */
  finalize(outcome: "committed" | "none", message: string): LayoutToolTextResult;
}
