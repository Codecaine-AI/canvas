import { useMemo, useState, type ReactNode, type RefObject } from "react";
import type {
  CanvasGeometry,
  CanvasSelection,
  InteractiveCanvasAnnotation,
  InteractiveCanvasDocument,
  InteractiveCanvasEditorHandle,
  InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";

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

export interface DevRailProps {
  document: InteractiveCanvasDocument;
  editorState: InteractiveCanvasEditorState | null;
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
}

type Rect = { x: number; y: number; width: number; height: number };

function toRect(geometry: CanvasGeometry): Rect {
  return {
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
  };
}

function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

/**
 * World rect an annotation occupies, for the "inside the selection bbox"
 * check: object targets use the object's geometry, region targets their
 * region, connection targets the union of their endpoint objects' bounds.
 */
function annotationRect(
  annotation: InteractiveCanvasAnnotation,
  document: InteractiveCanvasDocument,
): Rect | null {
  const target = annotation.target;
  if (target.kind === "region") return toRect(target.region);
  if (target.kind === "object") {
    const object = document.objects.find((candidate) => candidate.id === target.objectId);
    return object ? toRect(object.geometry) : null;
  }
  const connection = document.connections.find(
    (candidate) => candidate.id === target.connectionId,
  );
  if (!connection) return null;
  const endpointRects: Rect[] = [];
  for (const endpoint of [connection.from, connection.to]) {
    const object = document.objects.find((candidate) => candidate.id === endpoint.objectId);
    if (object) endpointRects.push(toRect(object.geometry));
  }
  return unionRects(endpointRects);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function MonoLine({ children }: { children: ReactNode }) {
  return <p className="break-all font-mono text-[11px] leading-relaxed">{children}</p>;
}

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
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-md border border-r-0 border-border bg-card px-1.5 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground shadow-md transition-colors hover:text-foreground"
        style={{ writingMode: "vertical-rl" }}
      >
        Dev
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-border bg-card shadow-xl">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider">Dev rail</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        <Section title="Selection">
          {selection.kind === "objects" && selectedObjects.length > 0 ? (
            <div className="flex flex-col gap-1">
              {selectedObjects.map((object) => (
                <MonoLine key={object.id}>
                  {object.id} · {object.type} · x {formatNumber(object.geometry.x)} y{" "}
                  {formatNumber(object.geometry.y)} w {formatNumber(object.geometry.width)} h{" "}
                  {formatNumber(object.geometry.height)}
                </MonoLine>
              ))}
              {selectionBounds ? (
                <MonoLine>
                  bbox · x {formatNumber(selectionBounds.x)} y {formatNumber(selectionBounds.y)} w{" "}
                  {formatNumber(selectionBounds.width)} h {formatNumber(selectionBounds.height)}
                </MonoLine>
              ) : null}
            </div>
          ) : selection.kind === "connection" ? (
            <MonoLine>connection · {selection.connectionId}</MonoLine>
          ) : selection.kind === "annotation" ? (
            <MonoLine>annotation · {selection.annotationId}</MonoLine>
          ) : selection.kind === "region" ? (
            <MonoLine>
              region · x {formatNumber(selection.region.x)} y {formatNumber(selection.region.y)} w{" "}
              {formatNumber(selection.region.width)} h {formatNumber(selection.region.height)}
            </MonoLine>
          ) : (
            <Empty>Nothing selected.</Empty>
          )}
        </Section>

        <Section title="Viewport">
          {viewport ? (
            <MonoLine>
              x {formatNumber(viewport.x)} · y {formatNumber(viewport.y)} · zoom{" "}
              {viewport.zoom.toFixed(2)}
            </MonoLine>
          ) : (
            <Empty>No viewport yet.</Empty>
          )}
        </Section>

        <Section title="Last change">
          {lastChange ? (
            <div className="flex flex-col gap-1">
              <MonoLine>
                source · {lastChange.source}
                {lastChange.summary ? ` · ${lastChange.summary}` : ""}
              </MonoLine>
              <MonoLine>
                objects {lastChange.changedObjectIds.length} · connections{" "}
                {lastChange.changedConnectionIds.length} · annotations{" "}
                {lastChange.changedAnnotationIds.length}
              </MonoLine>
              {lastChange.changedObjectIds.length > 0 ? (
                <MonoLine>{lastChange.changedObjectIds.join(", ")}</MonoLine>
              ) : null}
            </div>
          ) : (
            <Empty>No changes yet.</Empty>
          )}
        </Section>

        <Section title="Annotations">
          {annotations.length > 0 ? (
            <div className="flex flex-col gap-1">
              {annotations.map((annotation) => (
                <div key={annotation.id} className="flex items-baseline gap-1.5">
                  <MonoLine>
                    {annotation.id} · {annotation.status} ·{" "}
                    {annotation.body.length > 40
                      ? `${annotation.body.slice(0, 40)}…`
                      : annotation.body || "(empty)"}
                  </MonoLine>
                  {annotation.intent === "agent-request" ? (
                    <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent-foreground">
                      agent request
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>No annotations on this board.</Empty>
          )}
        </Section>

        <Section title="Agent snapshot">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted p-2 font-mono text-[10px] leading-relaxed">
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
