/**
 * container id → live layout session: the seam the agent's state/ render
 * reads through.
 *
 * The kernel's state contract requires the agent's state object `S` to be
 * JSON-serializable, so the canvas document cannot live inside it — the
 * session store stays the single authority for the baseline/draft pair, the
 * request queue, and the rendered views. But `render(state)` has to emit the
 * CURRENT board digest on every request, which means it needs to reach that
 * authority at render time.
 *
 * `RenderContext` carries the container id, and the session store already
 * keys sessions by container. This module publishes that mapping at module
 * scope so the agent bundle's state/ sidecar — imported by the kernel registry,
 * not by the store — can look the live session up without holding a reference
 * to the store instance, and without a second copy of the document.
 *
 * A miss is not an error: outside the harness process (a unit test, a replay
 * of a persisted state.json) there is no live session, and `render` falls back
 * to the spawn-time snapshot it seeded with, marked stale.
 */
import type { LayoutSession } from "./store";

const byContainer = new Map<string, LayoutSession>();

/** Publish a session under its container id. Re-registering replaces. */
export function registerLayoutSession(session: LayoutSession): void {
  byContainer.set(session.containerId, session);
}

/** Drop a session from the lookup (session teardown, test isolation). */
export function forgetLayoutSession(containerId: string): void {
  byContainer.delete(containerId);
}

/** The live session for a container, or null when it is not in this process. */
export function layoutSessionForContainer(
  containerId: string | undefined | null,
): LayoutSession | null {
  if (typeof containerId !== "string" || containerId.length === 0) return null;
  return byContainer.get(containerId) ?? null;
}
