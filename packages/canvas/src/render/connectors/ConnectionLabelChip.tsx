"use client";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "../../model/schema";
import { routeConnection } from "../../routing/routing";

/**
 * Pill chip rendered at a connector's routed label point (world layer, so it
 * pans/zooms with the canvas). Double-clicking opens the inline label editor
 * (owned by the editor via `onConnectionDoubleClick`/`worldOverlay`).
 */
export function ConnectionLabelChip({
  connection,
  fromObject,
  toObject,
  obstacles,
  onDoubleClick,
}: {
  connection: InteractiveCanvasConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  /** Full document object list so the label sits on the same obstacle-avoiding route the connector renders. */
  obstacles: ReadonlyArray<InteractiveCanvasObject>;
  onDoubleClick?: (connectionId: string) => void;
}) {
  if (!connection.label) return null;
  const routed = routeConnection(fromObject, toObject, connection, obstacles);
  return (
    <div
      data-canvas-connection-label={connection.id}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.(connection.id);
      }}
      style={{
        position: "absolute",
        left: `${routed.labelPoint.x}px`,
        top: `${routed.labelPoint.y}px`,
        transform: "translate(-50%, -50%)",
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    >
      {connection.label}
    </div>
  );
}
