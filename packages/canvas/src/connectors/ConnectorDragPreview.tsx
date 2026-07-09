"use client";

/**
 * Connector drag previews draw live routed paths, anchor emphasis, and
 * quick-connect ghosts during connector gestures.
 */
import { objectById, type CanvasPoint } from "../state/geometry";
import type { InteractionOverlay } from "../interaction/interaction";
import { connectionBoundsForObject, getConnectionAnchors } from "../objects/geometry";
import { CONNECTOR_DASH_PATTERN_PX } from "./def";
import {
  autoPickAnchors,
  connectorPathFromPoints,
  routeConnection,
  routeConnectionToPoint,
  type Anchor,
} from "./routing";
import { worldToScreen, type ViewportState } from "../render/viewport";
import { ObjectShape } from "../render/ObjectShape";
import { resolveConnectorStroke } from "../palette";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
/** Selection outline/handle color — inlined from the old CHROME.selectionBlue (render must not import editor/components/editor-style). */
const SELECTION_BLUE = "#0D99FF";
const CONNECTOR_PREVIEW_STROKE = resolveConnectorStroke(FIRST_USE_COLORS.connector);
const CONNECTOR_PREVIEW_STROKE_WIDTH_PX = 4;
const CONNECTOR_PREVIEW_OPACITY = 0.6;

function quickConnectGhostId(
  source: InteractiveCanvasObject,
  objects: ReadonlyArray<InteractiveCanvasObject>,
): string {
  const baseId = `${source.id}-quick-connect-ghost`;
  if (!objects.some((object) => object.id === baseId)) return baseId;

  let suffix = 2;
  while (objects.some((object) => object.id === `${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function quickConnectGhostWorldGeometry(
  source: InteractiveCanvasObject,
  center: CanvasPoint,
): InteractiveCanvasObject["geometry"] {
  return {
    x: center.x - source.geometry.width / 2,
    y: center.y - source.geometry.height / 2,
    width: source.geometry.width,
    height: source.geometry.height,
  };
}

function quickConnectGhostObject(
  source: InteractiveCanvasObject,
  geometry: InteractiveCanvasObject["geometry"],
  id: string,
): InteractiveCanvasObject {
  return {
    id,
    type: source.type,
    text: "",
    ...(source.color ? { color: source.color } : {}),
    parentId: null,
    geometry,
    ...(source.style ? { style: { ...source.style } } : {}),
    ...(source.layout ? { layout: { ...source.layout } } : {}),
    ...(source.direction ? { direction: source.direction } : {}),
    ...(typeof source.author === "string" ? { author: source.author } : {}),
    ...(source.icon ? { icon: source.icon } : {}),
  };
}

/**
 * Live preview rendered while a connector endpoint is being dragged (3.2.2
 * reconnect) or a brand-new connector is being pulled from a port (3.3.2
 * create): a routed path from the fixed end to either the hovered candidate's
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

    const previewPath = connectorPathFromPoints(drag.points);
    const strokeDasharray =
      connection.style === "dashed" ? CONNECTOR_DASH_PATTERN_PX.join(" ") : undefined;
    const transform = worldSvgTransform(viewport);

    return (
      <svg
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <g transform={transform}>
          <path
            d={previewPath}
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

  const candidateObject = drag.candidate ? objectById(document, drag.candidate.objectId) ?? undefined : undefined;
  const sourceObject = drag.fromObjectId ? objectById(document, drag.fromObjectId) ?? undefined : undefined;
  const ghostWorldObject =
    !drag.connectionId && !candidateObject && sourceObject
      ? quickConnectGhostObject(
          sourceObject,
          quickConnectGhostWorldGeometry(sourceObject, drag.point),
          quickConnectGhostId(sourceObject, document.objects),
        )
      : null;
  const previewPath = routedPreviewPath(document, drag, sourceObject, candidateObject, ghostWorldObject);
  if (!previewPath) return null;
  const markerEnd = previewShowsForwardArrowhead(document, drag)
    ? `url(#${document.id}-arrow-forward)`
    : undefined;

  // True-outline port anchors (connection-cascade.ts getConnectionAnchors) in
  // a stable top/bottom/left/right order (matching its candidates array).
  const portAnchors = candidateObject ? getConnectionAnchors(candidateObject) : [];
  const PORT_ANCHOR_NAMES: Anchor[] = ["top", "bottom", "left", "right"];
  const snappedWorld = drag.candidate?.snapKind === "outline" ? drag.candidate.point : undefined;
  // The ghost renders at WORLD size inside a zoom-scaled wrapper (below) —
  // NOT at pre-multiplied screen size. Size-derived rendering (the icon
  // glyph stroke step-down, logical-px shape borders) must see the same
  // dimensions the placed object will have, or the ghost's line weight comes
  // out 1/zoom heavier than the real thing.
  const ghostScreenOrigin = ghostWorldObject
    ? worldToScreen(viewport, { x: ghostWorldObject.geometry.x, y: ghostWorldObject.geometry.y })
    : null;
  const ghostObject = ghostWorldObject
    ? {
        ...ghostWorldObject,
        geometry: { ...ghostWorldObject.geometry, x: 0, y: 0 },
      }
    : null;

  return (
    <>
      {ghostObject && ghostScreenOrigin ? (
        <div
          data-canvas-quick-connect-ghost="true"
          style={{
            position: "absolute",
            left: `${ghostScreenOrigin.x}px`,
            top: `${ghostScreenOrigin.y}px`,
            transform: `scale(${viewport.zoom})`,
            transformOrigin: "0 0",
            opacity: 0.35,
            pointerEvents: "none",
          }}
        >
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
        <g transform={worldSvgTransform(viewport)}>
          <path
            d={previewPath}
            fill="none"
            stroke={CONNECTOR_PREVIEW_STROKE}
            strokeWidth={CONNECTOR_PREVIEW_STROKE_WIDTH_PX}
            strokeLinecap="butt"
            markerEnd={markerEnd}
            opacity={CONNECTOR_PREVIEW_OPACITY}
            data-canvas-connector-preview-path="true"
          />
        </g>
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

function routedPreviewPath(
  document: InteractiveCanvasDocument,
  drag: NonNullable<InteractionOverlay["connectorDrag"]>,
  sourceObject: InteractiveCanvasObject | undefined,
  candidateObject: InteractiveCanvasObject | undefined,
  ghostWorldObject: InteractiveCanvasObject | null,
): string | null {
  if (drag.connectionId) {
    const connection = document.connections.find((item) => item.id === drag.connectionId);
    if (!connection || !drag.end) return null;
    const fromObject = objectById(document, connection.from.objectId);
    const toObject = objectById(document, connection.to.objectId);
    if (!fromObject || !toObject) return null;

    if (candidateObject && drag.candidate) {
      const candidateEndpoint = {
        objectId: candidateObject.id,
        anchor: drag.candidate.anchor,
        ...(drag.candidate.position ? { position: drag.candidate.position } : {}),
      };
      const previewConnection: InteractiveCanvasConnection = {
        id: `${connection.id}-preview`,
        from: drag.end === "from" ? candidateEndpoint : connection.from,
        to: drag.end === "to" ? candidateEndpoint : connection.to,
      };
      const previewFromObject = drag.end === "from" ? candidateObject : fromObject;
      const previewToObject = drag.end === "to" ? candidateObject : toObject;
      return routeConnection(
        previewFromObject,
        previewToObject,
        previewConnection,
        document.objects,
      ).path;
    }

    const routed = routeConnection(fromObject, toObject, connection, document.objects);
    const fixedObject = drag.end === "from" ? toObject : fromObject;
    const fixedAnchor = drag.end === "from" ? routed.endAnchor : routed.startAnchor;
    return routeConnectionToPoint(fixedObject, fixedAnchor, drag.point).path;
  }

  if (!sourceObject) return null;

  const fromAnchor =
    drag.fromAnchor ??
    autoPickAnchors(connectionBoundsForObject(sourceObject), {
      x: drag.point.x,
      y: drag.point.y,
      width: 0,
      height: 0,
    }).startAnchor;

  if (candidateObject && drag.candidate) {
    const previewConnection: InteractiveCanvasConnection = {
      id: `${sourceObject.id}-${candidateObject.id}-preview`,
      from: { objectId: sourceObject.id, anchor: fromAnchor },
      to: {
        objectId: candidateObject.id,
        anchor: drag.candidate.anchor,
        ...(drag.candidate.position ? { position: drag.candidate.position } : {}),
      },
    };
    return routeConnection(sourceObject, candidateObject, previewConnection, document.objects).path;
  }

  if (ghostWorldObject) {
    const previewConnection: InteractiveCanvasConnection = {
      id: `${sourceObject.id}-${ghostWorldObject.id}-preview`,
      from: { objectId: sourceObject.id, anchor: fromAnchor },
      to: { objectId: ghostWorldObject.id },
    };
    return routeConnection(sourceObject, ghostWorldObject, previewConnection, document.objects).path;
  }

  return routeConnectionToPoint(sourceObject, fromAnchor, drag.point).path;
}

function previewShowsForwardArrowhead(
  document: InteractiveCanvasDocument,
  drag: NonNullable<InteractionOverlay["connectorDrag"]>,
): boolean {
  if (!drag.connectionId) return true;
  if (drag.end !== "to") return false;
  const connection = document.connections.find((item) => item.id === drag.connectionId);
  const arrow = connection?.arrow ?? "forward";
  return arrow === "forward" || arrow === "both";
}

function worldSvgTransform(viewport: ViewportState): string {
  return `translate(${-viewport.x * viewport.zoom} ${-viewport.y * viewport.zoom}) scale(${viewport.zoom})`;
}
