/**
 * The layout tool runtime — the harness handle bound to the layout-editor
 * agent's private tools.ts sidecar at spawn time (HARNESS-SETUP-PLAN §3).
 *
 * Each method resolves "which layout session am I?" internally through the
 * kernel run context (containerId → session), so the tool sidecar stays a
 * thin schema + dispatch layer.
 */

import type { AgentPatchOperation } from "../protocol";

export interface LayoutToolTextResult {
  text: string;
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface LayoutToolRenderResult extends LayoutToolTextResult {
  /** PNG bytes of the rendered draft (absent on error). */
  png?: Buffer;
}

export interface LayoutRenderRequest {
  /** Optional world-space crop; defaults to the scope frame + 128px ring. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Output raster width in px (default ~1400). */
  pixelWidth?: number;
}

export interface LayoutToolRuntime {
  /** Board digest + diagnostics for the current draft (exemplar PNG on the first call). */
  board(): LayoutToolRenderResult;
  /** Scoped fit of the current draft → program + legend + boundary report (legacy view). */
  fitScope(): LayoutToolRenderResult;
  /** Apply id-addressed document operations directly to the current draft (result: DELTA + LINTS delta + auto close-up PNG). */
  applyOps(ops: AgentPatchOperation[]): LayoutToolRenderResult;
  /** Apply the quickfix offered by a diagnostic id from the latest diagnostics run (same perception result as applyOps). */
  applyQuickfix(diagnosticId: string): LayoutToolRenderResult;
  /** Fit or solve geometry for an explicit selection without deleting objects. */
  solveLayout(objectIds: string[], program?: string): LayoutToolTextResult;
  /** Whole-program proposal → parse errors verbatim, or delta + lint reports. */
  proposeProgram(program: string): LayoutToolTextResult;
  /** Render the current draft (crop/zoom) → PNG for the model. */
  renderDraft(request: LayoutRenderRequest): LayoutToolRenderResult;
  /** Full text, exact geometry, occupancy ASCII for the given object refs. */
  inspect(objectIds: string[]): LayoutToolTextResult;
  /** Commit the current draft as the session proposal; ends the run. */
  commit(summary: string): LayoutToolTextResult;
  /** Abandon the session without a proposal; ends the run. */
  abandon(reason: string): LayoutToolTextResult;
}
