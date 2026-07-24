"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AlertTriangleIcon } from "lucide-react";
import { CanvasStage } from "./CanvasStage";
import { ZoomControls } from "./chrome/ZoomControls";
import { documentBounds, type CanvasBounds } from "./geometry";
import { useCanvasViewport } from "./use-canvas-viewport";
import {
  containerViewBounds,
  fitBounds,
  fitDocument,
  panBy,
  type ScreenSize,
  type ViewportState,
} from "./viewport";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "./schema";

export interface InteractiveCanvasViewerProps {
  document: InteractiveCanvasDocument;
  selectedObjectIds?: string[];
  changedObjectIds?: string[];
  compact?: boolean;
  /** When set, fits the viewport to this container or section object's bounds (D4 view-cropping). */
  view?: string;
  /**
   * false (default): a static fit — the stage self-sizes by the (view-cropped)
   * content's aspect ratio and renders like an image, with no grid and no
   * pan/zoom. true: an explorable surface — drag to pan, wheel/pinch to zoom,
   * zoom controls overlaid bottom-right; the stage fills its host container
   * (the host must give it a height).
   *
   * Either way the viewer renders ONLY the diagram surface: no header, no
   * badges, no card. Framing is the host's job.
   */
  interactive?: boolean;
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

/** The stage never collapses below this height in either mode. */
const MIN_STAGE_HEIGHT = 200;
/** Static aspect clamp: never taller than ~6:16 (portrait), never wider than 4:1. */
const STATIC_MIN_ASPECT = 6 / 16;
const STATIC_MAX_ASPECT = 4;
/** Tight static fit padding so the diagram fills the frame like an image. */
const STATIC_FIT_PADDING = 16;
/** Pointer travel (px) before a press becomes a pan instead of a click. */
const DRAG_PAN_THRESHOLD_PX = 4;

function useMeasuredSize(ref: React.RefObject<HTMLDivElement | null>): ScreenSize | null {
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
  }, [ref]);

  return size;
}

/**
 * Read-only canvas viewer: a bare diagram surface with no framing of its own —
 * no header row, no badges, no card, no footer. Hosts wrap it in whatever
 * border/header their context calls for.
 *
 * Static mode (default) fits the `view` crop (or the whole document) once and
 * stays put. Interactive mode reuses the editor's viewport machinery
 * (useCanvasViewport) for wheel/pinch zoom and space/middle-mouse pan, adds
 * plain-drag panning with click-vs-drag disambiguation (a sub-threshold press
 * still clicks objects when `onObjectSelect` is wired), and overlays the
 * package's ZoomControls bottom-right.
 */
export const InteractiveCanvasViewer = memo(function InteractiveCanvasViewer({
  document,
  selectedObjectIds = [],
  changedObjectIds = [],
  compact,
  view,
  interactive = false,
  onObjectSelect,
  onCanvasSelect,
  onCanvasContextMenu,
  onObjectContextMenu,
  className,
}: InteractiveCanvasViewerProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const measuredSize = useMeasuredSize(shellRef);

  const viewNotFound = Boolean(view) && !containerViewBounds(document, view!);

  // Static fit — recomputed as the shell resizes; unused while interactive.
  const staticViewport: ViewportState = useMemo(() => {
    const screen: ScreenSize = measuredSize ?? {
      width: compact ? 760 : 960,
      height: compact ? 320 : 360,
    };
    if (view) {
      const bounds = containerViewBounds(document, view);
      if (bounds) return fitBounds(bounds, screen, STATIC_FIT_PADDING);
    }
    return fitDocument(document, screen, STATIC_FIT_PADDING);
  }, [document, view, measuredSize, compact]);

  // Interactive viewport: fit-on-mount, wheel/pinch zoom, space/middle-mouse
  // pan, and the fit/+/-/100% controls. Inert when `interactive` is false.
  const {
    viewport: liveViewport,
    setViewport,
    isPanning,
    controls,
  } = useCanvasViewport({
    document,
    stageRef: shellRef,
    enabled: interactive,
    panOnPlainDrag: false,
  });

  // Initial interactive framing: fit the `view` crop when one resolves
  // (useCanvasViewport's own mount fit only knows the whole document).
  // Declared after the hook so it runs after the hook's mount fit.
  useEffect(() => {
    if (!interactive) return;
    const stage = shellRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const screen: ScreenSize = { width: rect.width, height: rect.height };
    const bounds = view ? containerViewBounds(document, view) : null;
    setViewport(bounds ? fitBounds(bounds, screen) : fitDocument(document, screen));
  }, [interactive, document, view, setViewport]);

  const viewport = interactive ? liveViewport : staticViewport;

  // Plain-drag panning with click-vs-drag disambiguation: a press only turns
  // into a pan after DRAG_PAN_THRESHOLD_PX of travel, so sub-threshold presses
  // still deliver clicks to objects (annotation targeting keeps working).
  // Once a pan starts, the trailing click is swallowed in the capture phase.
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const travel = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (travel < DRAG_PAN_THRESHOLD_PX) return;
      drag.moved = true;
      suppressClickRef.current = true;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort (not all test DOMs implement it).
      }
      return;
    }
    const dx = drag.lastX - event.clientX;
    const dy = drag.lastY - event.clientY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setViewport((previous) => panBy(previous, dx, dy));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // Static stages self-size by the cropped content's aspect ratio, clamped to
  // a sane range, so the diagram reads like an inline image.
  const staticAspect = useMemo(() => {
    if (interactive) return null;
    const bounds =
      (view ? containerViewBounds(document, view) : null) ?? documentBounds(document, 0);
    const rawAspect = bounds.height > 0 ? bounds.width / bounds.height : STATIC_MAX_ASPECT;
    return Math.min(STATIC_MAX_ASPECT, Math.max(STATIC_MIN_ASPECT, rawAspect));
  }, [document, view, interactive]);

  const shellStyle: CSSProperties = interactive
    ? {
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        minHeight: `${MIN_STAGE_HEIGHT}px`,
        cursor: isPanning ? "grabbing" : "grab",
        touchAction: "none",
      }
    : {
        position: "relative",
        overflow: "hidden",
        minHeight: `${MIN_STAGE_HEIGHT}px`,
        aspectRatio: `${staticAspect}`,
      };

  return (
    <section
      className={className}
      data-mdx-block="Canvas"
      data-docs-block-type="canvas"
      data-source-id={document.id}
      data-canvas-interactive={interactive ? "true" : undefined}
      style={interactive ? { width: "100%", height: "100%" } : undefined}
    >
      <div
        ref={shellRef}
        className="interactive-canvas-shell"
        style={shellStyle}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerEnd : undefined}
        onPointerCancel={interactive ? handlePointerEnd : undefined}
        onClickCapture={interactive ? handleClickCapture : undefined}
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
          // Static renders drop the dot grid so the diagram sits on a clean
          // surface; the explorable surface keeps it as pan/zoom feedback.
          style={interactive ? undefined : { backgroundImage: "none" }}
        />
        {view && viewNotFound && (
          <div
            data-canvas-view-warning=""
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              zIndex: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: "1px solid color-mix(in oklab, var(--destructive) 40%, var(--border))",
              borderRadius: "999px",
              background: "color-mix(in oklab, var(--background) 85%, transparent)",
              padding: "3px 8px",
              color: "var(--destructive)",
              fontSize: "11px",
              pointerEvents: "none",
            }}
          >
            <AlertTriangleIcon style={{ width: 12, height: 12 }} />
            View not found: {view}
          </div>
        )}
        {interactive && (
          <div
            data-canvas-zoom-overlay=""
            style={{ position: "absolute", right: 12, bottom: 12, zIndex: 10 }}
          >
            <ZoomControls
              zoomPercent={viewport.zoom}
              onZoomIn={controls.zoomIn}
              onZoomOut={controls.zoomOut}
              onZoomPercentClick={controls.zoomTo100}
            />
          </div>
        )}
      </div>
    </section>
  );
});
