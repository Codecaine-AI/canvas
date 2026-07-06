"use client";

import { objectById, type CanvasPoint } from "../../model/geometry";
import type { InteractionOverlay } from "../../interaction/interaction";
import { getConnectionAnchors } from "../../routing/connection-overlay";
import { pointForAnchor, routeConnection, type Anchor } from "../../routing/routing";
import { worldToScreen, type ViewportState } from "../viewport";
import { CHROME } from "../../tokens/figjam-tokens";
import type { InteractiveCanvasDocument } from "../../model/schema";

/**
 * Live preview rendered while a connector endpoint is being dragged (3.2.2
 * reconnect) or a brand-new connector is being pulled from a port (3.3.2
 * create): a dashed path from the fixed end to either the hovered candidate's
 * anchor point or the raw pointer position, plus 4 anchor dots on the
 * currently-hovered candidate object (the snapped one emphasized).
 */
export function ConnectorDragPreview({
  document,
  viewport,
  drag,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  drag: NonNullable<InteractionOverlay["connectorDrag"]>;
}) {
  let fixedWorld: CanvasPoint | null = null;

  if (drag.connectionId) {
    const connection = document.connections.find((item) => item.id === drag.connectionId);
    if (connection) {
      const fromObject = objectById(document, connection.from.objectId);
      const toObject = objectById(document, connection.to.objectId);
      if (fromObject && toObject) {
        const routed = routeConnection(fromObject, toObject, connection, document.objects);
        fixedWorld = drag.end === "from" ? routed.end : routed.start;
      }
    }
  } else if (drag.fromObjectId && drag.fromAnchor) {
    const fromObject = objectById(document, drag.fromObjectId);
    if (fromObject) {
      fixedWorld = pointForAnchor(fromObject.geometry, drag.fromAnchor);
    }
  }

  if (!fixedWorld) return null;

  // The dashed preview aims at the exact snapped point (anchor or outline —
  // W3b cascade) when one exists, else the coarse anchor side, else the raw
  // pointer.
  const candidateObject = drag.candidate ? objectById(document, drag.candidate.objectId) : undefined;
  const targetWorld =
    drag.candidate?.point ??
    (candidateObject ? pointForAnchor(candidateObject.geometry, drag.candidate!.anchor) : drag.point);

  const start = worldToScreen(viewport, fixedWorld);
  const end = worldToScreen(viewport, targetWorld);
  // True-outline port anchors (connection-overlay.ts getConnectionAnchors) in
  // a stable top/bottom/left/right order (matching its candidates array).
  const portAnchors = candidateObject ? getConnectionAnchors(candidateObject) : [];
  const PORT_ANCHOR_NAMES: Anchor[] = ["top", "bottom", "left", "right"];
  const snappedWorld = drag.candidate?.snapKind === "outline" ? drag.candidate.point : undefined;

  return (
    <>
      <svg
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          fill="none"
          stroke={CHROME.selectionBlue}
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
        />
      </svg>
      {/* FigJam-style hover ports (W3b): 4 white-fill, selection-blue-ring
          circles on the hovered object's true outline; the anchor the cascade
          snapped to renders emphasized (bigger, filled blue). */}
      {portAnchors.map((portAnchor, index) => {
        const screenPoint = worldToScreen(viewport, portAnchor.point);
        const isSnapped =
          drag.candidate?.snapKind === "anchor" &&
          !!drag.candidate.point &&
          Math.abs(drag.candidate.point.x - portAnchor.point.x) < 0.5 &&
          Math.abs(drag.candidate.point.y - portAnchor.point.y) < 0.5;
        return (
          <div
            key={PORT_ANCHOR_NAMES[index]}
            data-canvas-anchor-dot={PORT_ANCHOR_NAMES[index]}
            data-canvas-anchor-snapped={isSnapped ? "" : undefined}
            style={{
              position: "absolute",
              left: `${screenPoint.x}px`,
              top: `${screenPoint.y}px`,
              width: isSnapped ? "12px" : "8px",
              height: isSnapped ? "12px" : "8px",
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              background: isSnapped ? CHROME.selectionBlue : "#FFFFFF",
              border: `1.5px solid ${CHROME.selectionBlue}`,
              pointerEvents: "none",
            }}
          />
        );
      })}
      {/* Off-anchor outline snap: a filled dot at the exact outline point the
          endpoint will attach to (stored as `position` on drop). */}
      {snappedWorld && (
        <div
          data-canvas-outline-snap-dot=""
          style={{
            position: "absolute",
            left: `${worldToScreen(viewport, snappedWorld).x}px`,
            top: `${worldToScreen(viewport, snappedWorld).y}px`,
            width: "10px",
            height: "10px",
            transform: "translate(-50%, -50%)",
            borderRadius: "999px",
            background: CHROME.selectionBlue,
            border: "1.5px solid #FFFFFF",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
