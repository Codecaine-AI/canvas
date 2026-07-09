"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { hitTestObjects } from "../../../interaction/hit-testing";
import { connectionBoundsForObject } from "../../../objects/geometry";
import { sectionTitleChipWorldRect } from "../../../objects/section/title-chip-geometry";
import {
  ANCHOR_DOT_OFFSET_PX,
  HIT_TARGET_PX,
} from "../../../render/overlays/AnchorDots";
import type { CanvasTool } from "../../../state/actions";
import type { CanvasBounds, CanvasPoint } from "../../../state/geometry";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../state/schema";

const SECTION_OUTLINE_HIT_SCREEN_PX = 10;
const HOVER_HALO_SCREEN_PX = ANCHOR_DOT_OFFSET_PX + HIT_TARGET_PX / 2 + 2;

type ResolveHoverTargetArgs = {
  document: InteractiveCanvasDocument;
  worldPoint: CanvasPoint;
  zoom?: number;
  previousHoveredObjectId?: string | null;
};

export type UseHoverTargetArgs = {
  document: InteractiveCanvasDocument;
  tool: CanvasTool;
  zoom: number;
};

export type HoverTargetApi = {
  hoveredObjectId: string | null;
  hoveredObjectIdRef: RefObject<string | null>;
  updateHoverTarget: (worldPoint: CanvasPoint) => void;
  clearHoverTarget: () => void;
};

function safeZoom(zoom: number | undefined): number {
  return zoom && zoom > 0 ? zoom : 1;
}

function boundsContainPoint(bounds: CanvasBounds, point: CanvasPoint): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function sectionOutlineContainsPoint(
  section: InteractiveCanvasObject,
  point: CanvasPoint,
  zoom: number,
): boolean {
  if (boundsContainPoint(sectionTitleChipWorldRect(section, zoom), point)) return true;

  const bounds = connectionBoundsForObject(section);
  if (!boundsContainPoint(bounds, point)) return false;

  const tolerance = SECTION_OUTLINE_HIT_SCREEN_PX / zoom;
  const distanceToOutline = Math.min(
    point.x - bounds.x,
    bounds.x + bounds.width - point.x,
    point.y - bounds.y,
    bounds.y + bounds.height - point.y,
  );
  return distanceToOutline <= tolerance;
}

function hoverHitObject(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
  zoom: number,
): InteractiveCanvasObject | null {
  const hit = hitTestObjects(document, worldPoint, { zoom });
  if (!hit) return null;
  if (hit.type !== "section") return hit;
  return sectionOutlineContainsPoint(hit, worldPoint, zoom) ? hit : null;
}

function expandedConnectionBoundsContainPoint(
  object: InteractiveCanvasObject,
  point: CanvasPoint,
  zoom: number,
): boolean {
  const halo = HOVER_HALO_SCREEN_PX / zoom;
  const bounds = connectionBoundsForObject(object);
  return (
    point.x >= bounds.x - halo &&
    point.x <= bounds.x + bounds.width + halo &&
    point.y >= bounds.y - halo &&
    point.y <= bounds.y + bounds.height + halo
  );
}

export function resolveHoverTarget({
  document,
  worldPoint,
  zoom: rawZoom,
  previousHoveredObjectId = null,
}: ResolveHoverTargetArgs): string | null {
  const zoom = safeZoom(rawZoom);
  const freshHit = hoverHitObject(document, worldPoint, zoom);
  if (freshHit) return freshHit.id;

  if (!previousHoveredObjectId) return null;
  const previous = document.objects.find((object) => object.id === previousHoveredObjectId);
  if (!previous) return null;
  return expandedConnectionBoundsContainPoint(previous, worldPoint, zoom)
    ? previous.id
    : null;
}

export function useHoverTarget({
  document,
  tool,
  zoom,
}: UseHoverTargetArgs): HoverTargetApi {
  const [hoveredObjectId, setHoveredObjectIdState] = useState<string | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null);

  const setHoveredObjectId = useCallback((objectId: string | null) => {
    hoveredObjectIdRef.current = objectId;
    setHoveredObjectIdState(objectId);
  }, []);

  const clearHoverTarget = useCallback(() => {
    setHoveredObjectId(null);
  }, [setHoveredObjectId]);

  const updateHoverTarget = useCallback(
    (worldPoint: CanvasPoint) => {
      if (tool !== "connector") {
        clearHoverTarget();
        return;
      }
      setHoveredObjectId(
        resolveHoverTarget({
          document,
          worldPoint,
          zoom,
          previousHoveredObjectId: hoveredObjectIdRef.current,
        }),
      );
    },
    [clearHoverTarget, document, setHoveredObjectId, tool, zoom],
  );

  useEffect(() => {
    if (tool === "connector") return;
    clearHoverTarget();
  }, [clearHoverTarget, tool]);

  useEffect(() => {
    const current = hoveredObjectIdRef.current;
    if (!current) return;
    if (document.objects.some((object) => object.id === current)) return;
    clearHoverTarget();
  }, [clearHoverTarget, document.objects]);

  return {
    hoveredObjectId,
    hoveredObjectIdRef,
    updateHoverTarget,
    clearHoverTarget,
  };
}
