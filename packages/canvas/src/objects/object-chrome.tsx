"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Anchor } from "../routing/routing";
import { resolveObjectColors, resolveObjectStrokeWidth } from "../tokens/theme";
import type { InteractiveCanvasObject } from "../state/schema";
import type { ObjectRenderProps, RenderObjectShape } from "./object-def";

/**
 * Shared button chrome for registry-driven object renderers: the outer
 * `<button>` (positioning style, docs-targeting/data attributes, select and
 * context-menu handlers) and the quick-connect edge ports. Extracted from
 * render/ObjectShape's original generic branch so per-kind defs compose it
 * instead of re-deriving it; ObjectShape's own generic fallback (for render
 * shapes with no registered def) now composes this same shared code too —
 * there is no separate inline copy left to keep in sync.
 */

export function objectStyle(object: InteractiveCanvasObject): CSSProperties {
  const colors = resolveObjectColors(object.style);
  const style: CSSProperties = {
    left: `${object.geometry.x}px`,
    top: `${object.geometry.y}px`,
    width: `${object.geometry.width}px`,
    height: `${object.geometry.height}px`,
    background: colors.fill,
    borderColor: colors.border,
    color: colors.text,
    // W4 z-layering (see the connector <svg> comment in CanvasStage): non-
    // section shapes paint above the connector layer (z 1); sections render
    // via their own def (explicit z 0) below it.
    zIndex: 2,
  };
  // W4 — explicit stroke gets FigJam's universal 4px chrome (or the object's
  // own strokeWidth); tone/token-only objects keep the legacy 2px CSS border.
  if (object.style?.stroke || object.style?.strokeWidth) {
    style.borderWidth = `${resolveObjectStrokeWidth(object.style)}px`;
  }
  return style;
}

/**
 * The generic object button: identical attribute set (and order) to the one
 * the original pre-registry ObjectShape rendered, so every kind keeps
 * byte-identical DOM. `renderShape` is the effective render shape stamped on
 * `data-canvas-object-shape`.
 */
export function ObjectButtonChrome({
  object,
  renderShape,
  className,
  selected,
  changed,
  dropTarget,
  editable,
  bounds,
  onObjectSelect,
  onObjectContextMenu,
  children,
}: Pick<
  ObjectRenderProps,
  | "object"
  | "selected"
  | "changed"
  | "dropTarget"
  | "editable"
  | "bounds"
  | "onObjectSelect"
  | "onObjectContextMenu"
> & {
  renderShape: RenderObjectShape;
  className: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      data-docs-target="true"
      data-docs-target-type={`canvas-${object.type}`}
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${object.label}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape={renderShape}
      data-selected={selected ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      aria-label={object.label}
      style={objectStyle(object)}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(object.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, object, bounds);
      }}
    >
      {children}
    </button>
  );
}

const EDGE_PORT_ANCHORS: Anchor[] = ["top", "right", "bottom", "left"];

/** Edge-port fractional offsets within an object's box, matching HANDLE_POSITIONS' side midpoints. */
const PORT_POSITIONS: Record<Anchor, { fx: number; fy: number }> = {
  top: { fx: 0.5, fy: 0 },
  right: { fx: 1, fy: 0.5 },
  bottom: { fx: 0.5, fy: 1 },
  left: { fx: 0, fy: 0.5 },
};

/** Quick-connect edge ports (editor only) — identical markup to the original pre-registry ObjectShape. */
export function EdgePorts({ object, zoom = 1 }: { object: InteractiveCanvasObject; zoom?: number }) {
  return (
    <>
      {EDGE_PORT_ANCHORS.map((anchor) => {
        const { fx, fy } = PORT_POSITIONS[anchor];
        return (
          <span
            key={anchor}
            className="interactive-canvas-edge-port"
            data-canvas-port={anchor}
            data-canvas-object-id={object.id}
            style={{
              position: "absolute",
              left: `${fx * 100}%`,
              top: `${fy * 100}%`,
              // Counter-scale against the world layer's zoom transform so the
              // port dot stays a constant screen size regardless of zoom.
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
            onClick={(event) => event.stopPropagation()}
          />
        );
      })}
    </>
  );
}
