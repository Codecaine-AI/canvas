"use client";

import type {
  CanvasGeometry,
  CanvasIconGlyph,
  CanvasObjectStyle,
  CanvasShapeDirection,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "../schema";

export function defaultGeometryFor(type: InteractiveCanvasObjectType): CanvasGeometry {
  if (type === "rectangle") return { x: 80, y: 80, width: 360, height: 240 };
  if (type === "decision") return { x: 160, y: 160, width: 160, height: 112 };
  if (type === "sticky") return { x: 180, y: 180, width: 176, height: 128 };
  if (type === "annotation-marker") return { x: 220, y: 220, width: 40, height: 40 };
  if (type === "document") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "person") return { x: 160, y: 160, width: 120, height: 140 };
  if (type === "database") return { x: 160, y: 160, width: 140, height: 120 };
  if (type === "chat") return { x: 160, y: 160, width: 180, height: 110 };
  // W2 — sections default large (they're meant to wrap other objects, so a
  // container-like footprint reads better than a shape-sized default).
  if (type === "section") return { x: 80, y: 80, width: 480, height: 360 };
  if (type === "pill") return { x: 160, y: 160, width: 200, height: 64 };
  // W2 — arrow-shape default matches the reference proportions (361x100
  // logical) at a comfortable placement size.
  if (type === "arrow-shape") return { x: 160, y: 160, width: 361, height: 100 };
  if (type === "predefined-process") return { x: 160, y: 160, width: 200, height: 100 };
  if (type === "code-block") return { x: 160, y: 160, width: 320, height: 200 };
  if (type === "chip-icon") return { x: 160, y: 160, width: 120, height: 140 };
  // W5 — FigJam parity shape set (Wave A): sizes per the implementation
  // brief's size table (docs/10-system-design/20-figjam-parity's "Missing
  // shape specs" section, cross-checked against this brief's overrides).
  if (type === "ellipse") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "triangle") return { x: 160, y: 160, width: 140, height: 120 };
  if (type === "parallelogram") return { x: 160, y: 160, width: 160, height: 100 };
  if (type === "pentagon") return { x: 160, y: 160, width: 140, height: 140 };
  if (type === "octagon") return { x: 160, y: 160, width: 140, height: 140 };
  if (type === "star") return { x: 160, y: 160, width: 140, height: 140 };
  if (type === "plus") return { x: 160, y: 160, width: 120, height: 120 };
  if (type === "chevron") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "folder") return { x: 160, y: 160, width: 140, height: 110 };
  if (type === "document-stack") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "off-page-connector") return { x: 160, y: 160, width: 120, height: 100 };
  if (type === "trapezoid") return { x: 160, y: 160, width: 150, height: 100 };
  if (type === "manual-input") return { x: 160, y: 160, width: 150, height: 100 };
  if (type === "hexagon") return { x: 160, y: 160, width: 150, height: 100 };
  if (type === "internal-storage") return { x: 160, y: 160, width: 150, height: 110 };
  if (type === "or-junction") return { x: 160, y: 160, width: 100, height: 100 };
  if (type === "summing-junction") return { x: 160, y: 160, width: 100, height: 100 };
  if (type === "cylinder-horizontal") return { x: 160, y: 160, width: 150, height: 100 };
  if (type === "page-corner") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "icon") return { x: 160, y: 160, width: 120, height: 120 };
  return { x: 160, y: 160, width: 184, height: 96 };
}

export function objectTypeLabel(type: InteractiveCanvasObjectType): string {
  if (type === "rectangle") return "Rectangle";
  if (type === "process") return "Process";
  if (type === "decision") return "Decision";
  if (type === "sticky") return "Sticky";
  if (type === "document") return "Document";
  if (type === "person") return "Person";
  if (type === "database") return "Database";
  if (type === "chat") return "Chat";
  if (type === "section") return "Section";
  if (type === "pill") return "Pill";
  if (type === "arrow-shape") return "Arrow";
  if (type === "predefined-process") return "Predefined Process";
  if (type === "code-block") return "Code Block";
  if (type === "chip-icon") return "Chip";
  // W5 — FigJam parity shape set (Wave A):
  if (type === "ellipse") return "Ellipse";
  if (type === "triangle") return "Triangle";
  if (type === "parallelogram") return "Parallelogram";
  if (type === "pentagon") return "Pentagon";
  if (type === "octagon") return "Octagon";
  if (type === "star") return "Star";
  if (type === "plus") return "Plus";
  if (type === "chevron") return "Chevron";
  if (type === "folder") return "Folder";
  if (type === "document-stack") return "Document Stack";
  if (type === "off-page-connector") return "Off-page Connector";
  if (type === "trapezoid") return "Trapezoid";
  if (type === "manual-input") return "Manual Input";
  if (type === "hexagon") return "Hexagon";
  if (type === "internal-storage") return "Internal Storage";
  if (type === "or-junction") return "Or Junction";
  if (type === "summing-junction") return "Summing Junction";
  if (type === "cylinder-horizontal") return "Cylinder (Horizontal)";
  if (type === "page-corner") return "Page Corner";
  if (type === "icon") return "Icon";
  return "Annotation";
}

export function toneForType(type: InteractiveCanvasObjectType): InteractiveCanvasTone {
  if (type === "rectangle") return "neutral";
  if (type === "decision") return "decision";
  if (type === "sticky") return "warning";
  if (type === "annotation-marker") return "annotation";
  if (type === "document") return "memory";
  if (type === "person") return "input";
  if (type === "database") return "memory";
  if (type === "chat") return "process";
  // W2 — new shapes resolve their fill/stroke from theme/tokens (pastel
  // pairs / fixed tokens) via theme.ts, not the tone system; "neutral" here
  // is an inert fallback that's never actually read for these types.
  if (type === "section") return "neutral";
  if (type === "pill") return "input";
  if (type === "arrow-shape") return "process";
  if (type === "predefined-process") return "memory";
  if (type === "code-block") return "neutral";
  if (type === "chip-icon") return "neutral";
  // W5 — FigJam parity shape set (Wave A): every new type resolves color
  // from figjam-theme/resolve.ts directly (not the tone system), so "neutral"
  // here is the same inert fallback the W2 shapes above already use.
  if (
    type === "ellipse" ||
    type === "triangle" ||
    type === "parallelogram" ||
    type === "pentagon" ||
    type === "octagon" ||
    type === "star" ||
    type === "plus" ||
    type === "chevron" ||
    type === "folder" ||
    type === "document-stack" ||
    type === "off-page-connector" ||
    type === "trapezoid" ||
    type === "manual-input" ||
    type === "hexagon" ||
    type === "internal-storage" ||
    type === "or-junction" ||
    type === "summing-junction" ||
    type === "cylinder-horizontal" ||
    type === "page-corner" ||
    type === "icon"
  ) {
    return "neutral";
  }
  return "process";
}

/**
 * Builds the complete object a creation flow will produce for `objectType` at
 * `geometry` — the single source of truth shared by the canvas.addObject
 * reducer (which adds a real id/parentId and snapped geometry) and the
 * armed-tool ghost preview (which renders this draft verbatim so what the
 * user sees under the cursor is exactly what a click creates). `direction`
 * and `icon` carry the Shapes-panel catalog-entry variant (triangle up/down,
 * Advanced-tier glyph); `label` overrides the per-type default (e.g. an icon
 * entry's glyph name instead of the generic "Icon").
 */
export function draftPlacedObject(
  objectType: InteractiveCanvasObjectType,
  geometry: CanvasGeometry,
  options?: {
    id?: string;
    label?: string;
    parentId?: string | null;
    tone?: InteractiveCanvasTone;
    direction?: CanvasShapeDirection;
    icon?: CanvasIconGlyph;
  },
): InteractiveCanvasObject {
  const label = options?.label ?? objectTypeLabel(objectType);
  return {
    id: options?.id ?? "",
    type: objectType,
    label,
    parentId: options?.parentId ?? null,
    geometry,
    style: {
      tone: options?.tone ?? toneForType(objectType),
      shape: shapeForType(objectType),
    },
    ...(options?.direction ? { direction: options.direction } : null),
    ...(options?.icon ? { icon: options.icon } : null),
    // W2 — sections carry their visible title in `title`/`tint`, not the
    // generic tone/shape style bag; default to a neutral "gray" family so a
    // freshly-placed section is immediately valid per validateInteractiveCanvasDocument.
    ...(objectType === "section" ? { title: label, tint: "gray" as const } : null),
  };
}

/** Shape name for a given object type, used by canvas.addObject to set style.shape. */
export function shapeForType(type: InteractiveCanvasObjectType): CanvasObjectStyle["shape"] {
  if (type === "decision") return "diamond";
  if (type === "sticky") return "note";
  if (type === "annotation-marker") return "marker";
  if (type === "document") return "document";
  if (type === "person") return "person";
  if (type === "database") return "database";
  if (type === "chat") return "chat";
  if (type === "section") return "section";
  if (type === "pill") return "pill";
  if (type === "arrow-shape") return "arrow-shape";
  if (type === "predefined-process") return "predefined-process";
  if (type === "code-block") return "code-block";
  if (type === "chip-icon") return "chip-icon";
  // W5 — FigJam parity shape set (Wave A): each new type maps to its own
  // same-named style.shape variant (see CanvasObjectStyle["shape"] in schema.ts).
  if (type === "ellipse") return "ellipse";
  if (type === "triangle") return "triangle";
  if (type === "parallelogram") return "parallelogram";
  if (type === "pentagon") return "pentagon";
  if (type === "octagon") return "octagon";
  if (type === "star") return "star";
  if (type === "plus") return "plus";
  if (type === "chevron") return "chevron";
  if (type === "folder") return "folder";
  if (type === "document-stack") return "document-stack";
  if (type === "off-page-connector") return "off-page-connector";
  if (type === "trapezoid") return "trapezoid";
  if (type === "manual-input") return "manual-input";
  if (type === "hexagon") return "hexagon";
  if (type === "internal-storage") return "internal-storage";
  if (type === "or-junction") return "or-junction";
  if (type === "summing-junction") return "summing-junction";
  if (type === "cylinder-horizontal") return "cylinder-horizontal";
  if (type === "page-corner") return "page-corner";
  if (type === "icon") return "icon";
  return "rounded-rect";
}
