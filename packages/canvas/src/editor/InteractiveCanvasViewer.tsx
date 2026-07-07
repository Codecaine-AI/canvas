"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AlertTriangleIcon, MessageSquareIcon } from "../ui/icons";
import { annotationTargetLabel, CanvasStage } from "../render/CanvasStage";
import type { CanvasBounds } from "../state/geometry";
import { containerViewBounds, fitBounds, fitDocument, type ScreenSize, type ViewportState } from "../render/viewport";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";

export interface InteractiveCanvasViewerProps {
  document: InteractiveCanvasDocument;
  selectedObjectIds?: string[];
  changedObjectIds?: string[];
  compact?: boolean;
  /** When set, fits the viewport to this section object's bounds (D4 view-cropping). */
  view?: string;
  onObjectSelect?: (objectId: string) => void;
  onCanvasSelect?: () => void;
  onCanvasContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    bounds: CanvasBounds,
  ) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
  className?: string;
}

const MIN_STAGE_HEIGHT = 360;
const COMPACT_MIN_HEIGHT = 320;

function useMeasuredSize(): [React.RefObject<HTMLDivElement | null>, ScreenSize | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ScreenSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export const InteractiveCanvasViewer = memo(function InteractiveCanvasViewer({
  document,
  selectedObjectIds = [],
  changedObjectIds = [],
  compact,
  view,
  onObjectSelect,
  onCanvasSelect,
  onCanvasContextMenu,
  onObjectContextMenu,
  className,
}: InteractiveCanvasViewerProps) {
  const [measureRef, measuredSize] = useMeasuredSize();
  const viewNotFound = Boolean(view) && !containerViewBounds(document, view!);

  const viewport: ViewportState = useMemo(() => {
    const screen: ScreenSize = measuredSize ?? { width: compact ? 760 : 960, height: compact ? COMPACT_MIN_HEIGHT : MIN_STAGE_HEIGHT };
    if (view) {
      const bounds = containerViewBounds(document, view);
      if (bounds) return fitBounds(bounds, screen);
    }
    return fitDocument(document, screen);
  }, [document, view, measuredSize, compact]);

  const minHeight = compact ? COMPACT_MIN_HEIGHT : MIN_STAGE_HEIGHT;

  const stage = (
    <div
      ref={measureRef}
      className="interactive-canvas-shell"
      style={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        minHeight: `${minHeight}px`,
        aspectRatio: `${document.size?.width ?? 16} / ${document.size?.height ?? 9}`,
      }}
    >
      <CanvasStage
        document={document}
        viewport={viewport}
        selectedObjectIds={selectedObjectIds}
        changedObjectIds={changedObjectIds}
        compact={compact}
        onObjectSelect={onObjectSelect}
        onCanvasSelect={onCanvasSelect}
        onCanvasContextMenu={onCanvasContextMenu}
        onObjectContextMenu={onObjectContextMenu}
      />
    </div>
  );

  return (
    <section
      className={className}
      data-mdx-block="Canvas"
      data-docs-block-type="canvas"
      data-source-id={document.id}
    >
      <div className="not-prose my-4 overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
          <span className="font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Interactive Canvas
          </span>
          <span className="text-sm font-medium">{document.title ?? document.id}</span>
          <span className="interactive-canvas-badge">{document.objects.length} objects</span>
          <span className="interactive-canvas-badge">{document.connections.length} connectors</span>
          {(document.annotations?.length ?? 0) > 0 && (
            <span className="interactive-canvas-badge">
              <MessageSquareIcon className="h-3 w-3" />
              {document.annotations?.length} annotations
            </span>
          )}
          {view && viewNotFound && (
            <span className="interactive-canvas-badge interactive-canvas-badge-warning">
              <AlertTriangleIcon className="h-3 w-3" />
              View not found: {view}
            </span>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">{document.id}</span>
        </div>
        <div className="p-3">{stage}</div>
        {(document.annotations?.length ?? 0) > 0 && (
          <div className="grid gap-2 border-t bg-background p-3 text-xs text-muted-foreground sm:grid-cols-2">
            {(document.annotations ?? []).map((annotation) => (
              <div key={annotation.id} className="rounded-md border bg-background p-2">
                <span className="font-medium text-foreground">
                  {annotation.intent === "agent-request" ? "Agent request" : "Note"}
                </span>
                <span> on {annotationTargetLabel(annotation.target)}: </span>
                <span>{annotation.body}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .interactive-canvas-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: color-mix(in oklab, var(--background) 80%, transparent);
          padding: 3px 8px;
          color: var(--muted-foreground);
          font-size: 11px;
        }
        .interactive-canvas-badge-warning {
          border-color: color-mix(in oklab, var(--destructive) 40%, var(--border));
          color: var(--destructive);
        }
      `}</style>
    </section>
  );
});
