import { createContext, useContext } from "react";

export type ArrowMarkerDirection = "forward" | "back";

/**
 * Each mounted CanvasStage owns its arrowhead `<marker>` defs. Element ids are
 * page-global, so two stages showing the same document (an inline embed plus
 * its fullscreen viewer) must not share ids: `url(#id)` resolves to the first
 * match in the page, and a marker inside a hidden stage paints nothing. The
 * stage provides a per-instance scope; connectors and drag previews read it.
 */
const ArrowMarkerScopeContext = createContext<string | null>(null);

export const ArrowMarkerScopeProvider = ArrowMarkerScopeContext.Provider;

/** A stage-unique marker scope from the document id and a React `useId()` value. */
export function arrowMarkerScope(documentId: string, instanceId: string): string {
  return `${documentId}-${instanceId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export function arrowMarkerId(scope: string, direction: ArrowMarkerDirection): string {
  return `${scope}-arrow-${direction}`;
}

/** The `url(#…)` for the enclosing stage's marker; falls back to the bare document id outside a stage. */
export function useArrowMarkerUrl(documentId: string, direction: ArrowMarkerDirection): string {
  const scope = useContext(ArrowMarkerScopeContext) ?? documentId;
  return `url(#${arrowMarkerId(scope, direction)})`;
}
