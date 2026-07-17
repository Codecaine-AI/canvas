"use client";

/**
 * Read-only canvas viewer face: measures/fits the viewport and mounts the stage.
 * It supplies passive selection feedback but owns no editing machine.
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AlertTriangleIcon, MessageSquareIcon } from "../../ui/icons";
import { annotationTargetLabel, CanvasStage } from "../CanvasStage";
import { InteractionFeedbackScreen } from "../editor/pipeline/InteractionFeedback";
import type { CanvasBounds } from "../../state/geometry";
import { containerViewBounds, fitBounds, fitDocument, type ScreenSize, type ViewportState } from "../viewport";
import {
  useCanvasViewport,
  type CanvasViewportControls,
} from "../../navigation/use-canvas-viewport";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

export interface InteractiveCanvasViewerProps {
  document: InteractiveCanvasDocument;
  selectedObjectIds?: string[];
  changedObjectIds?: string[];
  compact?: boolean;
  /** When set, fits the viewport to this section object's bounds (D4 view-cropping). */
  view?: string;
  /** Enables wheel/pinch zoom and drag/trackpad panning without enabling edits. */
  interactive?: boolean;
  /** Removes the document card chrome and makes the stage fill its parent. */
  bare?: boolean;
  /** Shows compact fit/zoom controls over an interactive stage. */
  showNavigationControls?: boolean;
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

function ViewerNavigationControls({
  zoom,
  controls,
}: {
  zoom: number;
  controls: CanvasViewportControls;
}) {
  const buttonStyle = {
    border: 0,
    borderRadius: 7,
    background: "transparent",
    color: "#242424",
    cursor: "pointer",
    height: 26,
    minWidth: 26,
    padding: "0 7px",
    fontSize: 12,
  } as const;

  return (
    <div
      role="group"
      aria-label="Canvas navigation"
      data-canvas-viewer-controls="true"
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 10,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "3px 5px",
        border: "1px solid rgba(0, 0, 0, 0.12)",
        borderRadius: 10,
        background: "rgba(255, 255, 255, 0.94)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
      }}
    >
      <button type="button" aria-label="Fit canvas" onClick={controls.fit} style={buttonStyle}>
        Fit
      </button>
      <button type="button" aria-label="Zoom out" onClick={controls.zoomOut} style={buttonStyle}>
        −
      </button>
      <button
        type="button"
        aria-label={`Zoom level ${Math.round(zoom * 100)}%`}
        onClick={controls.zoomTo100}
        style={{ ...buttonStyle, minWidth: 46 }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" onClick={controls.zoomIn} style={buttonStyle}>
        +
      </button>
    </div>
  );
}

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
  interactive = false,
  bare = false,
  showNavigationControls = interactive,
  onObjectSelect,
  onCanvasSelect,
  onCanvasContextMenu,
  onObjectContextMenu,
  className,
}: InteractiveCanvasViewerProps) {
  const [measureRef, measuredSize] = useMeasuredSize();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewBounds = useMemo(
    () => (view ? containerViewBounds(document, view) : null),
    [document, view],
  );
  const viewNotFound = Boolean(view) && !viewBounds;

  const fittedViewport: ViewportState = useMemo(() => {
    const screen: ScreenSize = measuredSize ?? { width: compact ? 760 : 960, height: compact ? COMPACT_MIN_HEIGHT : MIN_STAGE_HEIGHT };
    if (viewBounds) return fitBounds(viewBounds, screen);
    return fitDocument(document, screen);
  }, [document, viewBounds, measuredSize, compact]);

  const navigation = useCanvasViewport({
    document,
    stageRef,
    enabled: interactive,
    panOnPlainDrag: interactive,
    fitTarget: viewBounds,
    fitTargetKey: `${document.id}:${view ?? ""}`,
  });
  const viewport = interactive ? navigation.viewport : fittedViewport;

  const minHeight = compact ? COMPACT_MIN_HEIGHT : MIN_STAGE_HEIGHT;

  const stage = (
    <div
      ref={measureRef}
      className="interactive-canvas-shell"
      style={{
        position: "relative",
        overflow: "hidden",
        border: bare ? 0 : "1px solid var(--border)",
        borderRadius: bare ? 0 : "8px",
        minHeight: bare ? 0 : `${minHeight}px`,
        width: "100%",
        height: bare ? "100%" : undefined,
        aspectRatio: bare ? undefined : `${document.size?.width ?? 16} / ${document.size?.height ?? 9}`,
      }}
    >
      <CanvasStage
        stageRef={stageRef}
        document={document}
        viewport={viewport}
        selectedObjectIds={selectedObjectIds}
        changedObjectIds={changedObjectIds}
        compact={compact}
        onObjectSelect={onObjectSelect}
        onCanvasSelect={onCanvasSelect}
        onCanvasContextMenu={onCanvasContextMenu}
        onObjectContextMenu={onObjectContextMenu}
        className="h-full"
        style={{
          cursor: navigation.isPanning ? "grabbing" : interactive ? "grab" : undefined,
          touchAction: interactive ? "none" : undefined,
        }}
        overlay={
          <InteractionFeedbackScreen
            document={document}
            viewport={viewport}
            selectedObjectIds={selectedObjectIds}
          />
        }
      />
      {interactive && showNavigationControls ? (
        <ViewerNavigationControls zoom={viewport.zoom} controls={navigation.controls} />
      ) : null}
    </div>
  );

  if (bare) {
    return (
      <section
        className={className}
        data-mdx-block="Canvas"
        data-docs-block-type="canvas"
        data-source-id={document.id}
        data-canvas-viewer-interactive={interactive ? "true" : undefined}
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      >
        {stage}
        {view && viewNotFound ? (
          <div
            role="status"
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              zIndex: 10,
              border: "1px solid rgba(159, 29, 29, 0.28)",
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.94)",
              color: "#9f1d1d",
              padding: "5px 9px",
              fontSize: 11,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            }}
          >
            View not found: {view}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={className}
      data-mdx-block="Canvas"
      data-docs-block-type="canvas"
      data-source-id={document.id}
      data-canvas-viewer-interactive={interactive ? "true" : undefined}
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
