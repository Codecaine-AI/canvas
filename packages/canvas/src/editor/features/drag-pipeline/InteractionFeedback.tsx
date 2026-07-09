"use client";

/**
 * Editor-owned interaction feedback for the canvas stage slots.
 * Keeps ephemeral drag/selection/guide chrome out of document rendering.
 */
import { useState, type ReactNode } from "react";
import { ConnectorDragPreview } from "../../../connectors/ConnectorDragPreview";
import { AnchorDots, type ActivePort } from "../../../connectors/AnchorDots";
import { quickConnectClickPoint } from "../../../connectors/gestures";
import { objectById, documentBounds } from "../../../state/geometry";
import type { CanvasTool } from "../../../state/actions";
import type { InteractionOverlay } from "../../../interaction/interaction";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { ObjectShape } from "../../../render/ObjectShape";
import type { ViewportState } from "../../../render/viewport";
import { SelectionBox } from "../../../render/overlays/SelectionBox";
import { HoverHighlight } from "../../../render/overlays/HoverHighlight";
import { Marquee } from "../../../render/overlays/Marquee";
import { PlacePreview } from "../../../render/overlays/PlacePreview";
import { SnapGuideLine } from "../../../render/overlays/SnapGuideLine";
import { DistributionGuideLine } from "../../../render/overlays/DistributionGuideLine";
import { SpacingChips } from "../../../render/overlays/SpacingChips";

type InteractionFeedbackBaseProps = {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  interactionOverlay?: InteractionOverlay;
  activeTool?: CanvasTool;
};

export function InteractionFeedbackWorld({
  document,
  viewport,
  interactionOverlay,
  activeTool,
  compact,
  children,
}: InteractionFeedbackBaseProps & {
  compact?: boolean;
  children?: ReactNode;
}) {
  const bounds = documentBounds(document);
  const zoom = viewport.zoom;

  return (
    <>
      {/*
        Armed-tool ghost preview: the full draft object the placement will
        create (overlay.placePreviewObject, built by the same
        draftPlacedObject the canvas.addObject reducer uses), rendered
        through the real ObjectShape registry semi-transparent — so the
        cursor ghost IS the shape (glyph, direction, label), not a generic
        box. Lives in this pointer-events-none world layer so it pans/zooms
        with the canvas and can never intercept the placement click.
      */}
      {interactionOverlay?.placePreviewObject && (
        <div data-canvas-place-ghost="true" style={{ opacity: 0.55 }}>
          <ObjectShape
            object={interactionOverlay.placePreviewObject}
            selected={false}
            changed={false}
            compact={compact}
            bounds={bounds}
            editable={false}
            zoom={zoom}
          />
        </div>
      )}
      {activeTool !== "hand" && children}
    </>
  );
}

export function InteractionFeedbackScreen({
  document,
  viewport,
  selectedObjectIds = [],
  interactionOverlay,
  hoveredObjectId = null,
  activeTool,
  interactionEnabled = false,
}: InteractionFeedbackBaseProps & {
  selectedObjectIds?: string[];
  hoveredObjectId?: string | null;
  interactionEnabled?: boolean;
}) {
  const [hoveredAnchorDot, setHoveredAnchorDot] = useState<ActivePort | null>(null);
  const handToolActive = activeTool === "hand";
  const connectorToolActive = activeTool === "connector";
  const activeConnectorDrag = interactionOverlay?.connectorDrag ?? null;
  const connectorDragSourceObjectId = interactionOverlay?.connectorDrag?.fromObjectId ?? null;
  const connectorDragSourceAnchor = interactionOverlay?.connectorDrag?.fromAnchor ?? null;
  const documentObjectIds = new Set(document.objects.map((object) => object.id));
  let anchorDotObjectIds: string[];
  if (connectorToolActive) {
    anchorDotObjectIds = [];
    for (const objectId of [hoveredObjectId, connectorDragSourceObjectId]) {
      if (objectId && documentObjectIds.has(objectId) && !anchorDotObjectIds.includes(objectId)) {
        anchorDotObjectIds.push(objectId);
      }
    }
  } else {
    anchorDotObjectIds = [...selectedObjectIds];
    for (const objectId of [connectorDragSourceObjectId]) {
      if (objectId && documentObjectIds.has(objectId) && !anchorDotObjectIds.includes(objectId)) {
        anchorDotObjectIds.push(objectId);
      }
    }
  }
  const hoveredQuickConnectDrag =
    !activeConnectorDrag &&
    interactionEnabled &&
    !handToolActive &&
    hoveredAnchorDot &&
    anchorDotObjectIds.includes(hoveredAnchorDot.objectId)
      ? (() => {
          const object = objectById(document, hoveredAnchorDot.objectId);
          if (!object) return null;
          return {
            fromObjectId: hoveredAnchorDot.objectId,
            fromAnchor: hoveredAnchorDot.anchor,
            point: quickConnectClickPoint(object, hoveredAnchorDot.anchor),
          } satisfies NonNullable<InteractionOverlay["connectorDrag"]>;
        })()
      : null;

  return (
    <>
      {!connectorToolActive && (
        <SelectionBox
          document={document}
          viewport={viewport}
          selectedObjectIds={selectedObjectIds}
          interactiveHandles={!handToolActive}
        />
      )}
      {interactionEnabled && !handToolActive && (
        <HoverHighlight
          document={document}
          viewport={viewport}
          objectId={connectorToolActive && !activeConnectorDrag ? hoveredObjectId : null}
        />
      )}
      {/* Connector previews must paint below anchor-dot buttons so hovered dots stay visually solid. */}
      {hoveredQuickConnectDrag && (
        <ConnectorDragPreview
          document={document}
          viewport={viewport}
          drag={hoveredQuickConnectDrag}
        />
      )}
      {activeConnectorDrag && (
        <ConnectorDragPreview
          document={document}
          viewport={viewport}
          drag={activeConnectorDrag}
        />
      )}
      {/* Anchor dots (D5/D15): def-derived connection anchors on every
          selected object — editor-only (same gate as the old edge ports:
          pointer events wired + not the hand tool). Rendered in this
          screen-space overlay, NOT in object chrome: the object button
          clips overflow, and true-outline anchors sit off the bbox edge. */}
      {interactionEnabled && !handToolActive && (
        <AnchorDots
          document={document}
          viewport={viewport}
          selectedObjectIds={anchorDotObjectIds}
          activePort={
            connectorDragSourceObjectId && connectorDragSourceAnchor
              ? { objectId: connectorDragSourceObjectId, anchor: connectorDragSourceAnchor }
              : null
          }
          interactive
          bypassZoomGate={connectorToolActive}
          onHoveredAnchorChange={setHoveredAnchorDot}
        />
      )}
      {interactionOverlay?.marquee && (
        <Marquee viewport={viewport} bounds={interactionOverlay.marquee} />
      )}
      {/* Dashed-box fallback only when no full draft object accompanies the
          bounds (all armed-tool paths now provide one — see placePreviewObject). */}
      {interactionOverlay?.placePreview && !interactionOverlay.placePreviewObject && (
        <PlacePreview viewport={viewport} bounds={interactionOverlay.placePreview} />
      )}
      {interactionOverlay?.guides?.map((guide, index) => (
        <SnapGuideLine key={`guide-${guide.axis}-${index}`} viewport={viewport} guide={guide} />
      ))}
      {interactionOverlay?.distributionGuides?.map((segment, index) => (
        <DistributionGuideLine key={`distribution-${index}`} viewport={viewport} segment={segment} />
      ))}
      {interactionOverlay?.spacing?.map((hint, index) => (
        <SpacingChips key={`spacing-${hint.axis}-${index}`} viewport={viewport} hint={hint} />
      ))}
    </>
  );
}
