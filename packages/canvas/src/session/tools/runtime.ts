/**
 * The layout tool runtime — the harness handle bound to the layout-editor
 * agent's private tools/ sidecar at spawn time.
 *
 * Each mutation call handles one operation, individually validating, applying,
 * and reporting it. Its result is sized to that operation and is text only: the
 * APPLIED line, what changed, the lint delta, and the routes it moved. The
 * deliberate perception call returns the standing picture — digest, cumulative
 * diff, full lint list, routes, request queue — plus the close-up render and
 * measurements of the one region it framed. The session tools manage the
 * annotation-thread queue and end the run.
 *
 * Each method resolves "which layout session am I?" internally through the
 * kernel run context (containerId → session), so the tool sidecar stays a
 * thin schema + dispatch layer.
 */
/**
 * `look`'s framing knob: one id, or several framed together as one region.
 * The framed region comes back rendered and measured; the board itself always
 * arrives with the state block, never from `look`.
 */
export interface LookRequest {
  /** Section, object, or connection ids to render close up as one region. */
  view?: string | readonly string[];
}

export interface LayoutToolTextResult {
  text: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface LayoutToolRenderResult extends LayoutToolTextResult {
  /**
   * Render payloads from perception. Only `look` produces them — the framed
   * region's close-up or crop. Absent on errors, on every mutation, and
   * whenever a look's render failed.
   */
  pngs?: Buffer[];
}

export interface LayoutToolRuntime {
  /**
   * Run one named operation against the current draft. `params` carries that
   * operation's own arguments and nothing else — the schema is sealed.
   */
  operation(name: string, params: Record<string, unknown>): LayoutToolRenderResult;
  /**
   * Read the board without changing it: the digest, the cumulative diff, the
   * open findings, how every edge routes, the request queue, and — for the
   * one region the call framed — that region's close-up render and
   * measurements. `view` names one or more sections, objects, or connections;
   * the union of everything named is framed as one region per call.
   */
  look(request: LookRequest): LayoutToolRenderResult;
  /**
   * Replace the board's standing markdown account of what it represents, its
   * pieces, and how it reads.
   */
  updateDescription(description: string): LayoutToolTextResult;
  /** Rename the board — the TopBar rename, from the agent side. */
  setBoardTitle(title: string): LayoutToolTextResult;
  /**
   * Open an agent-authored annotation thread on one object: a question left
   * for the user, which never blocks the run.
   */
  addAnnotation(objectId: string, body: string): LayoutToolTextResult;
  /**
   * Append a reply to an existing thread, leaving its status alone — the
   * conversational move; resolve_request is still the closing one.
   */
  replyAnnotation(id: string, body: string): LayoutToolTextResult;
  /** Dispose one user-request queue entry (done/declined + note). */
  resolveRequest(
    id: string,
    status: "done" | "declined",
    note: string,
  ): LayoutToolTextResult;
  /**
   * End the run: `committed` proposes the draft (gated on all scoped lints
   * and open requests), `none` ends without a proposal.
   */
  finalize(outcome: "committed" | "none", message: string): LayoutToolTextResult;
}
