"use client";

/**
 * Connector anchor-dot overlay renders connection ports and exposes their DOM
 * hit targets to the interaction pipeline.
 */
import { useEffect, useState } from "react";
import type { Anchor } from "./routing";
import type { InteractiveCanvasDocument } from "../state/schema";
import { connectionBoundsForObject } from "../objects/geometry";
import { worldToScreen, type ViewportState } from "../stage/viewport";

/** Selection outline/handle color — matches SelectionBox and the connector chrome (stage must not import stage/editor/components/editor-style). */
const SELECTION_BLUE = "#0D99FF";

/**
 * Zoom threshold below which select-mode anchor dots become hidden and inert
 * (D15, OBJECT-DEF-OVERHAUL.md §2). Connector mode bypasses this gate: its
 * hover-driven dots stay visible and interactive at every zoom. Resize corners
 * are unaffected (SelectionBox shows at any zoom). TUNABLE.
 */
export const ANCHOR_DOTS_MIN_ZOOM = 0.5;

/** Cardinal port names in the DOM attribute vocabulary the drag pipeline resolves. */
export const ANCHOR_NAMES: readonly Anchor[] = ["top", "bottom", "left", "right"];

/** Screen-space distance from the object bounds to the port affordance center. */
export const ANCHOR_DOT_OFFSET_PX = 20;
/** At-rest visible dot diameter. */
const DOT_DIAMETER_PX = 10;
/** Grab-target diameter around each dot. Also matches the hover button size. */
export const HIT_TARGET_PX = 28;

export type ActivePort = {
  objectId: string;
  anchor: Anchor;
};

export function anchorScreenPoint(
  viewport: ViewportState,
  object: InteractiveCanvasDocument["objects"][number],
  anchor: Anchor,
) {
  const bounds = connectionBoundsForObject(object);
  const top = worldToScreen(viewport, { x: bounds.x + bounds.width / 2, y: bounds.y });
  const bottom = worldToScreen(viewport, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height,
  });
  const left = worldToScreen(viewport, { x: bounds.x, y: bounds.y + bounds.height / 2 });
  const right = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height / 2,
  });
  if (anchor === "top") return { x: top.x, y: top.y - ANCHOR_DOT_OFFSET_PX };
  if (anchor === "bottom") return { x: bottom.x, y: bottom.y + ANCHOR_DOT_OFFSET_PX };
  if (anchor === "left") return { x: left.x - ANCHOR_DOT_OFFSET_PX, y: left.y };
  return { x: right.x + ANCHOR_DOT_OFFSET_PX, y: right.y };
}

function arrowTransform(anchor: Anchor): string {
  if (anchor === "top") return "rotate(-45deg)";
  if (anchor === "right") return "rotate(45deg)";
  if (anchor === "bottom") return "rotate(135deg)";
  return "rotate(-135deg)";
}

/**
 * FigJam-style connection anchor dots (D5): rendered in CanvasStage's
 * screen-space overlay at the def-derived getConnectionAnchors positions
 * (objects/geometry.ts) mapped worldToScreen — so the dots you see, the ports
 * you grab, and the points connections snap to are all the same declared
 * anchors. Select mode supplies selected object ids and keeps the 50% zoom
 * visibility/interactivity gate; connector mode supplies hovered/drag-source ids
 * and bypasses that gate so the hover affordance remains usable while zoomed out.
 * Replaces the old invisible EdgePorts (which sat inside the object button and
 * could only mark bbox midpoints — the button clips overflow, and true-outline
 * anchors sit off the bbox edge).
 *
 * Interaction: each dot carries data-canvas-port + data-canvas-object-id;
 * pointerdown bubbles to the stage root handler, whose resolveHit
 * closest("[data-canvas-port]") walk finds it exactly like the old ports —
 * starting a ConnectorCreateGesture from { objectId, anchor }.
 */
export function AnchorDots({
  document,
  viewport,
  selectedObjectIds,
  activePort,
  interactive,
  bypassZoomGate = false,
  onHoveredAnchorChange,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  selectedObjectIds: readonly string[];
  /** Port currently being pulled; renders in the pressed/dragging state. */
  activePort?: ActivePort | null;
  /** False renders the dots inert (visual only). */
  interactive: boolean;
  /** True keeps dots visible regardless of zoom, used by connector-tool hover affordances. */
  bypassZoomGate?: boolean;
  /** Emits the currently-hovered creation port so preview layers can render outside this overlay. */
  onHoveredAnchorChange?: (port: ActivePort | null) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  useEffect(() => {
    if (activePort) return;
    setPressedKey(null);
  }, [activePort]);
  useEffect(() => {
    if (selectedObjectIds.length === 0) {
      setHoveredKey(null);
      onHoveredAnchorChange?.(null);
    }
  }, [onHoveredAnchorChange, selectedObjectIds.length]);
  useEffect(() => () => onHoveredAnchorChange?.(null), [onHoveredAnchorChange]);
  if (selectedObjectIds.length === 0) return null;
  const selected = new Set(selectedObjectIds);
  const visible = bypassZoomGate || viewport.zoom >= ANCHOR_DOTS_MIN_ZOOM;
  return (
    <>
      {document.objects
        .filter((object) => selected.has(object.id))
        .map((object) =>
          ANCHOR_NAMES.map((name) => {
            const screen = anchorScreenPoint(viewport, object, name);
            const key = `${object.id}:${name}`;
            const isPressed =
              pressedKey === key ||
              (activePort?.objectId === object.id && activePort.anchor === name);
            const isHovered = hoveredKey === key || isPressed;
            return (
              <div
                key={key}
                data-canvas-port={name}
                data-canvas-object-id={object.id}
                onPointerEnter={() => {
                  setHoveredKey(key);
                  onHoveredAnchorChange?.({ objectId: object.id, anchor: name });
                }}
                onPointerLeave={() => {
                  setHoveredKey((current) => (current === key ? null : current));
                  onHoveredAnchorChange?.(null);
                }}
                onPointerDown={() => {
                  setPressedKey(key);
                  onHoveredAnchorChange?.(null);
                }}
                onPointerUp={() => setPressedKey((current) => (current === key ? null : current))}
                onPointerCancel={() => setPressedKey((current) => (current === key ? null : current))}
                style={{
                  position: "absolute",
                  left: `${screen.x}px`,
                  top: `${screen.y}px`,
                  width: `${HIT_TARGET_PX}px`,
                  height: `${HIT_TARGET_PX}px`,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                  touchAction: "none",
                  pointerEvents: interactive && visible ? "auto" : "none",
                  opacity: visible ? 1 : 0,
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: `${isHovered ? HIT_TARGET_PX : DOT_DIAMETER_PX}px`,
                    height: `${isHovered ? HIT_TARGET_PX : DOT_DIAMETER_PX}px`,
                    borderRadius: "999px",
                    background: isPressed ? SELECTION_BLUE : "#FFFFFF",
                    border: isHovered ? `2px solid ${SELECTION_BLUE}` : `1.5px solid ${SELECTION_BLUE}`,
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  {isHovered ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: "8px",
                        height: "8px",
                        borderTop: `2px solid ${isPressed ? "#FFFFFF" : SELECTION_BLUE}`,
                        borderRight: `2px solid ${isPressed ? "#FFFFFF" : SELECTION_BLUE}`,
                        transform: arrowTransform(name),
                      }}
                    />
                  ) : null}
                </div>
              </div>
            );
          }),
        )}
    </>
  );
}
