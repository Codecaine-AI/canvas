import { useMemo, useState, type RefObject } from "react";
import type {
  CanvasSelection,
  InteractiveCanvasDocument,
  InteractiveCanvasEditorHandle,
  InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";
import { AnnotationsSection } from "./_components/AnnotationsSection";
import { Empty } from "./_components/Empty";
import { LastChangeSection } from "./_components/LastChangeSection";
import { Section } from "./_components/Section";
import { SelectionSection } from "./_components/SelectionSection";
import { ViewportSection } from "./_components/ViewportSection";
import {
  annotationRect,
  rectsIntersect,
  selectedObjectIds,
  toRect,
  unionRects,
} from "./utils";

/**
 * The dev rail (HARNESS-SETUP-PLAN.md §2b "The dev rail") — a right-docked
 * sidebar on the canvas route, behind the dev-pages flag, showing live editor
 * internals: selection, viewport, last change (halo debugging), annotations,
 * and the agent snapshot — the invoke payload the agent would receive right
 * now. The session section is a placeholder until the agent service exists.
 *
 * Fed by App.tsx via the editor's onEditorStateChange callback plus the
 * imperative ref handle (used as a fallback snapshot before the first
 * callback fires). Fixed overlay with its own scroll; it never intercepts
 * events outside its own box, so the canvas underneath is undisturbed.
 */

export type DevRailProps = {
  document: InteractiveCanvasDocument;
  editorState: InteractiveCanvasEditorState | null;
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
};

export function DevRail({ document, editorState, editorRef }: DevRailProps) {
  const [open, setOpen] = useState(false);

  // Before the first onEditorStateChange fires, pull a one-off snapshot
  // through the imperative handle so the rail never renders stale nothing.
  const snapshot = editorState ?? editorRef.current?.getEditorSnapshot() ?? null;
  const selection: CanvasSelection = snapshot?.selection ?? { kind: "none" };
  const viewport = snapshot?.viewport ?? null;
  const lastChange = editorState?.lastChange;

  const scopeObjectIds = selectedObjectIds(selection);

  const selectedObjects = useMemo(
    () =>
      scopeObjectIds
        .map((id) => document.objects.find((object) => object.id === id))
        .filter((object) => object !== undefined),
    [document, scopeObjectIds],
  );

  const selectionBounds = useMemo(
    () => unionRects(selectedObjects.map((object) => toRect(object.geometry))),
    [selectedObjects],
  );

  // Connections crossing the selection boundary: exactly one endpoint inside
  // the scope. TODO(plan §2 scope.ts): section descendants join the scope
  // when the real Ring 0/1/2 scoping lands in the agent pipeline.
  const boundaryConnectionCount = useMemo(() => {
    if (scopeObjectIds.length === 0) return 0;
    const scope = new Set(scopeObjectIds);
    let count = 0;
    for (const connection of document.connections) {
      const fromInside = scope.has(connection.from.objectId);
      const toInside = scope.has(connection.to.objectId);
      if (fromInside !== toInside) count += 1;
    }
    return count;
  }, [document, scopeObjectIds]);

  const annotations = document.annotations ?? [];

  const annotationsInScope = useMemo(() => {
    if (!selectionBounds) return [];
    return annotations.filter((annotation) => {
      const rect = annotationRect(annotation, document);
      return rect ? rectsIntersect(rect, selectionBounds) : false;
    });
  }, [annotations, document, selectionBounds]);

  // The invoke payload as the plan defines it (§4 POST .../agent/sessions).
  // TODO(next wave): instruction comes from the invoke popover and
  // baselineHash from the saved file once the agent service exists.
  const agentSnapshot = {
    scopeObjectIds,
    boundaryConnectionCount,
    annotations: annotationsInScope.map((annotation) => ({
      id: annotation.id,
      intent: annotation.intent,
      status: annotation.status,
      body: annotation.body,
    })),
    viewport,
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open the dev rail"
        className="fixed right-0 top-1/2 z-raised -translate-y-1/2 rounded-l border border-r-0 border-border bg-card px-1.5 py-3 text-micro font-medium uppercase tracking-micro text-muted-foreground shadow-glass transition-colors hover:text-foreground"
        style={{ writingMode: "vertical-rl" }}
      >
        Dev
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-raised flex w-80 flex-col border-l border-border bg-card shadow-glass">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="truncate text-ui-md font-semibold leading-title text-ink">Dev rail</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-2 py-1 text-ui-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        <SelectionSection
          selection={selection}
          selectedObjects={selectedObjects}
          selectionBounds={selectionBounds}
        />

        <ViewportSection viewport={viewport} />

        <LastChangeSection lastChange={lastChange} />

        <AnnotationsSection annotations={annotations} />

        <Section title="Agent snapshot">
          <pre className="overflow-x-auto rounded border border-border bg-muted p-2 font-mono text-micro leading-ui">
            {JSON.stringify(agentSnapshot, null, 2)}
          </pre>
        </Section>

        <Section title="Session">
          <Empty>No session running.</Empty>
        </Section>
      </div>
    </aside>
  );
}
