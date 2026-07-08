"use client";

import { objectById, type CanvasPoint } from "../../state/geometry";
import type { InteractionOverlay } from "../../interaction/interaction";
import { getConnectionAnchors } from "../../objects/geometry";
import { CONNECTOR_DASH_PATTERN_PX } from "../../objects/connector/def";
import { polylineInteriorWaypoints } from "../../routing/bend-editing";
import { pointForObjectAnchor, routeConnection, type Anchor } from "../../routing/routing";
import { worldToScreen, type ViewportState } from "../viewport";
import { ObjectShape } from "../ObjectShape";
import { resolveConnectorStroke } from "../../palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
/** Selection outline/handle color — inlined from the old CHROME.selectionBlue (render must not import editor/components/editor-style). */
const SELECTION_BLUE = "#0D99FF";
const CONNECTOR_PREVIEW_STROKE = resolveConnectorStroke(FIRST_USE_COLORS.connector);

function quickConnectGhostObject(
  source: InteractiveCanvasObject,
  viewport: ViewportState,
  center: CanvasPoint,
): InteractiveCanvasObject {
  const topLeft = worldToScreen(viewport, {
    x: center.x - source.geometry.width / 2,
    y: center.y - source.geometry.height / 2,
  });
  return {
    id: `${source.id}-quick-connect-ghost`,
    type: source.type,
    text: "",
    ...(source.color ? { color: source.color } : {}),
    parentId: null,
    geometry: {
      x: topLeft.x,
      y: topLeft.y,
      width: source.geometry.width * viewport.zoom,
      height: source.geometry.height * viewport.zoom,
    },
    ...(source.style ? { style: { ...source.style } } : {}),
    ...(source.layout ? { layout: { ...source.layout } } : {}),
    ...(source.direction ? { direction: source.direction } : {}),
    ...(typeof source.language === "string" ? { language: source.language } : {}),
    ...(typeof source.author === "string" ? { author: source.author } : {}),
    ...(source.icon ? { icon: source.icon } : {}),
  };
}

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
  if (drag.connectionId && drag.points && drag.points.length >= 2) {
    const connection = document.connections.find((item) => item.id === drag.connectionId);
    if (!connection) return null;
    const fromObject = objectById(document, connection.from.objectId);
    const toObject = objectById(document, connection.to.objectId);
    if (!fromObject || !toObject) return null;

    const routed = routeConnection(
      fromObject,
      toObject,
      { ...connection, waypoints: polylineInteriorWaypoints(drag.points) },
      document.objects,
    );
    const strokeDasharray =
      connection.style === "dashed" ? CONNECTOR_DASH_PATTERN_PX.join(" ") : undefined;
    const transform = `translate(${-viewport.x * viewport.zoom} ${-viewport.y * viewport.zoom}) scale(${viewport.zoom})`;

    return (
      <svg
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <g transform={transform}>
          <path
            d={routed.path}
            fill="none"
            stroke={SELECTION_BLUE}
            strokeWidth={4}
            strokeLinecap="butt"
            strokeDasharray={strokeDasharray}
            data-canvas-connector-bend-preview-path="true"
          />
        </g>
      </svg>
    );
  }

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
      fixedWorld = pointForObjectAnchor(fromObject, drag.fromAnchor);
    }
  }

  if (!fixedWorld) return null;

  // The dashed preview aims at the exact snapped point (anchor or outline —
  // W3b cascade) when one exists, else the coarse anchor side, else the raw
  // pointer.
  const candidateObject = drag.candidate ? objectById(document, drag.candidate.objectId) : undefined;
  const sourceObject = drag.fromObjectId ? objectById(document, drag.fromObjectId) : undefined;
  const targetWorld =
    drag.candidate?.point ??
    (candidateObject ? pointForObjectAnchor(candidateObject, drag.candidate!.anchor) : drag.point);

  const start = worldToScreen(viewport, fixedWorld);
  const end = worldToScreen(viewport, targetWorld);
  // True-outline port anchors (connection-overlay.ts getConnectionAnchors) in
  // a stable top/bottom/left/right order (matching its candidates array).
  const portAnchors = candidateObject ? getConnectionAnchors(candidateObject) : [];
  const PORT_ANCHOR_NAMES: Anchor[] = ["top", "bottom", "left", "right"];
  const snappedWorld = drag.candidate?.snapKind === "outline" ? drag.candidate.point : undefined;
  const ghostObject =
    !candidateObject && sourceObject ? quickConnectGhostObject(sourceObject, viewport, drag.point) : null;

  return (
    <>
      {ghostObject ? (
        <div data-canvas-quick-connect-ghost="true" style={{ opacity: 0.35, pointerEvents: "none" }}>
          <ObjectShape
            object={ghostObject}
            selected={false}
            changed={false}
            bounds={ghostObject.geometry}
            editable={false}
            zoom={viewport.zoom}
          />
        </div>
      ) : null}
      <svg
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <path
          d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
          fill="none"
          stroke={CONNECTOR_PREVIEW_STROKE}
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
          data-canvas-connector-preview-path="true"
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
              background: isSnapped ? SELECTION_BLUE : "#FFFFFF",
              border: `1.5px solid ${SELECTION_BLUE}`,
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
            background: SELECTION_BLUE,
            border: "1.5px solid #FFFFFF",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
