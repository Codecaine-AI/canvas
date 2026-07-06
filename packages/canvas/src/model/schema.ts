"use client";

import type { SpectreRef } from "./spectre-ref";

export type InteractiveCanvasMode = "diagram";

export type InteractiveCanvasObjectType =
  | "container"
  | "process"
  | "decision"
  | "text"
  | "sticky"
  | "source-node"
  | "annotation-marker"
  // D16 — expanded vocabulary for the reference diagrams (checkpoint 5):
  | "document"
  | "person"
  | "database"
  | "chat"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  | "chip-icon"
  // W5 — FigJam parity shape set (Wave A): 19 native Basic/Flowchart primitives
  // plus the icon-glyph family, per docs/10-system-design/20-figjam-parity's
  // "Missing shape specs" and the Wave A implementation brief.
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "pentagon"
  | "octagon"
  | "star"
  | "plus"
  | "chevron"
  | "folder"
  | "document-stack"
  | "off-page-connector"
  | "trapezoid"
  | "manual-input"
  | "hexagon"
  | "internal-storage"
  | "or-junction"
  | "summing-junction"
  | "cylinder-horizontal"
  | "page-corner"
  | "icon";

export type InteractiveCanvasTone =
  | "neutral"
  | "input"
  | "process"
  | "decision"
  | "memory"
  | "agent"
  | "warning"
  | "annotation";

/**
 * Semantic color-as-meaning presets (D16, design doc §4.4): when present on an
 * object's style, this wins over `tone` for color resolution (see
 * theme.ts#resolveObjectColors) — process=blue (actions), input=green
 * (user/input/confirmed), hot=orange/red (generation/errors/loops),
 * memory=purple (documents/intents/memory), note=yellow (notes/decisions/cautions).
 */
export type CanvasPaletteToken = "process" | "input" | "hot" | "memory" | "note";

/**
 * FigJam section tint family (W2) — keys mirror figjam-tokens.ts's
 * SECTION_FAMILIES record exactly (that file is the source of truth for the
 * actual color values). Note: the W2 brief's prose used "cream" for the warm
 * neutral family; figjam-style-tokens.json's sampled key for that same tint is
 * "orange" — we use "orange" here to stay in lockstep with figjam-tokens.ts
 * rather than introduce a duplicate/aliased key.
 */
export type CanvasSectionTint =
  | "green"
  | "purple"
  | "orange"
  | "yellow"
  | "gray"
  | "white"
  | "pink"
  | "red"
  | "blue"
  | "teal";

/**
 * Directional field shared by every direction-aware shape (W5). Individual
 * types only accept a subset of these 4 values — see `direction` on
 * `InteractiveCanvasObject` and the per-type soft-default validation in
 * `validateInteractiveCanvasDocument` (arrow-shape/parallelogram/chevron:
 * "left" | "right", default "right"; triangle: "up" | "down", default "up").
 */
export type CanvasShapeDirection = "left" | "right" | "up" | "down";

/**
 * Chevron/arrow-shape pointing direction (W2). Kept as a back-compat alias of
 * the generalized `CanvasShapeDirection` (W5) for any external reference to
 * this name; arrow-shape's own accepted values are still just left|right.
 */
export type CanvasArrowShapeDirection = CanvasShapeDirection;

/**
 * Icon glyph selector for `type: "icon"` (W5) — the Advanced-tier FigJam
 * component family, 26 stroke-outline glyphs rendered in a 24x24 viewBox
 * with the label below (chip-icon precedent). Exact ids per the Wave A
 * implementation brief; Wave B2 owns the actual glyph-path registry.
 */
export type CanvasIconGlyph =
  | "activity"
  | "archive"
  | "key"
  | "chat"
  | "cloud"
  | "cpu"
  | "database"
  | "display"
  | "mail"
  | "file"
  | "code"
  | "bolt"
  | "pin"
  | "phone"
  | "package"
  | "coin"
  | "shield"
  | "send"
  | "server"
  | "cube"
  | "gear"
  | "drive"
  | "terminal"
  | "person"
  | "wallet"
  | "globe";

export type CanvasLinkStatus = "resolved" | "stale" | "missing" | "unresolved";

export type CanvasConnectionStyle = "solid" | "dotted" | "elbow" | "smooth";
export type CanvasSectionStrokeStyle = "solid" | "dashed" | "none";

export type CanvasArrowDirection = "none" | "forward" | "back" | "both";

export type CanvasAnnotationIntent = "note" | "agent-request";

export type CanvasAnnotationStatus = "open" | "applied" | "resolved";

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasObjectStyle = {
  tone?: InteractiveCanvasTone;
  shape?:
    | "rounded-rect"
    | "diamond"
    | "pill"
    | "note"
    | "marker"
    | "document"
    | "person"
    | "database"
    | "chat"
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    | "section"
    | "arrow-shape"
    | "predefined-process"
    | "code-block"
    | "chip-icon"
    // W5 — FigJam parity shape set (Wave A), one same-named variant per new type:
    | "ellipse"
    | "triangle"
    | "parallelogram"
    | "pentagon"
    | "octagon"
    | "star"
    | "plus"
    | "chevron"
    | "folder"
    | "document-stack"
    | "off-page-connector"
    | "trapezoid"
    | "manual-input"
    | "hexagon"
    | "internal-storage"
    | "or-junction"
    | "summing-junction"
    | "cylinder-horizontal"
    | "page-corner"
    | "icon";
  /** Semantic palette token (D16) — takes precedence over `tone` when set. */
  paletteToken?: CanvasPaletteToken;
  /**
   * Explicit fill color (W4) — any CSS color. Wins over the `paletteToken`/
   * `tone` theme-mix when set; the FigJam pastel PAIR palette
   * (figjam-tokens.ts PASTEL_PAIRS) is the intended vocabulary.
   */
  fill?: string;
  /** Explicit border/stroke color (W4) — wins over the theme-mix border when set. */
  stroke?: string;
  /**
   * Stroke width in logical px. Only meaningful when `stroke` is set;
   * defaults to the FigJam universal shape stroke (SHAPE_STROKE_WIDTH_PX = 4).
   */
  strokeWidth?: number;
  /** Section border style. Sections default to solid when omitted. */
  strokeStyle?: CanvasSectionStrokeStyle;
};

export type InteractiveCanvasObject = {
  id: string;
  type: InteractiveCanvasObjectType;
  label: string;
  body?: string;
  parentId?: string | null;
  geometry: CanvasGeometry;
  style?: CanvasObjectStyle;
  layout?: {
    mode: "free" | "row" | "column" | "stack";
    padding?: number;
    gap?: number;
  };
  source?: {
    path?: string;
    symbol?: string;
    section?: string;
  };
  /**
   * `type: "section"` only (W2). `title` is the text shown in the section's
   * floating title chip (distinct from `label`, which every object still
   * carries for a11y/docs-targeting/consistency but is not separately
   * rendered on sections — the chip IS the visible title). `tint` selects the
   * fill/chip family from figjam-tokens.ts's SECTION_FAMILIES. `locked`
   * reserved for a later wave (no enforcement yet — see actions.ts).
   */
  title?: string;
  tint?: CanvasSectionTint;
  locked?: boolean;
  contentHidden?: boolean;
  /**
   * Pointing/skew direction for direction-aware shapes (W2, generalized W5):
   * `arrow-shape` | `chevron` | `parallelogram` accept "left" | "right"
   * (soft-default "right" when omitted/invalid); `triangle` accepts
   * "up" | "down" (soft-default "up"). Absent/ignored for every other type.
   */
  direction?: CanvasShapeDirection;
  /** `type: "code-block"` only (W2) — selects the minimal tokenizer in code-tokenizer.ts. */
  language?: string;
  /** `type: "sticky"` only (W2) — rendered bottom-left at 12px/40% black. */
  author?: string;
  /**
   * `type: "icon"` only (W5) — REQUIRED glyph selector, one of the 26
   * Advanced-tier ids in `CanvasIconGlyph`. Missing/unknown is a hard
   * validation error (mirrors the `section` title/tint precedent above),
   * since an icon object with no glyph can't be rendered at all.
   */
  icon?: CanvasIconGlyph;
};

export type CanvasConnectionEndpoint = {
  objectId: string;
  anchor?: "top" | "right" | "bottom" | "left" | "center";
  /**
   * Relative anchor point on the endpoint object's bounds, as
   * [0..1, 0..1] fractions of (width, height) from the top-left corner.
   * Optional — when present, used by A* routing (D33 thread B) as a more
   * precise anchor than the coarse `anchor` side; when absent, routing
   * falls back to `anchor` / auto-picked sides.
   */
  position?: [number, number];
};

export type InteractiveCanvasConnection = {
  id: string;
  from: CanvasConnectionEndpoint;
  to: CanvasConnectionEndpoint;
  label?: string;
  style?: CanvasConnectionStyle;
  arrow?: CanvasArrowDirection;
  role?: string;
  /**
   * Stroke color for this connector (W3b/W4). Any non-empty string is
   * accepted (hex expected in practice — see figjam-tokens.ts's
   * CONNECTOR_COLORS for the sampled FigJam set). Absent means the default
   * neutral gray (CONNECTOR_DEFAULT_COLOR); arrowheads inherit the stroke.
   */
  color?: string;
  /**
   * Optional world-space polyline override (D33 thread B). When present,
   * `routeConnection` honors these points verbatim instead of recomputing
   * an obstacle-avoiding route. Each entry is a [x, y] world coordinate.
   */
  waypoints?: Array<[number, number]>;
};

export type InteractiveCanvasLink = {
  id: string;
  objectId: string;
  /**
   * Shared reference identity (D27): the same `SpectreRef` record used by
   * doc.json delta `reference` spans. Type-level alias only — the persisted
   * JSON shape is unchanged (kind/path/symbol/line/section/label).
   * Import direction: interactive-canvas depends on docs-model, never the
   * other way around.
   */
  target: SpectreRef;
  status: CanvasLinkStatus;
  checkedAt?: string;
};

export type CanvasAnnotationTarget =
  | { kind: "object"; objectId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "region"; region: CanvasGeometry };

export type InteractiveCanvasAnnotation = {
  id: string;
  target: CanvasAnnotationTarget;
  intent: CanvasAnnotationIntent;
  body: string;
  status: CanvasAnnotationStatus;
  createdBy: "human" | "agent" | "system";
  createdAt?: string;
};

export type InteractiveCanvasDocument = {
  schemaVersion: 1;
  id: string;
  title?: string;
  mode: InteractiveCanvasMode;
  viewport?: CanvasViewport;
  size?: {
    width: number;
    height: number;
  };
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
  links?: InteractiveCanvasLink[];
  annotations?: InteractiveCanvasAnnotation[];
};

export type CanvasValidationIssue = {
  path: string;
  message: string;
};

export type CanvasValidationResult =
  | {
      ok: true;
      document: InteractiveCanvasDocument;
      /** Non-fatal normalization notes — e.g. an unknown paletteToken was dropped. */
      warnings?: CanvasValidationIssue[];
    }
  | { ok: false; issues: CanvasValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value);
}

function isCanvasObjectType(value: unknown): value is InteractiveCanvasObjectType {
  return (
    value === "container" ||
    value === "process" ||
    value === "decision" ||
    value === "text" ||
    value === "sticky" ||
    value === "source-node" ||
    value === "annotation-marker" ||
    value === "document" ||
    value === "person" ||
    value === "database" ||
    value === "chat" ||
    value === "section" ||
    value === "pill" ||
    value === "arrow-shape" ||
    value === "predefined-process" ||
    value === "code-block" ||
    value === "chip-icon" ||
    // W5 — FigJam parity shape set (Wave A):
    value === "ellipse" ||
    value === "triangle" ||
    value === "parallelogram" ||
    value === "pentagon" ||
    value === "octagon" ||
    value === "star" ||
    value === "plus" ||
    value === "chevron" ||
    value === "folder" ||
    value === "document-stack" ||
    value === "off-page-connector" ||
    value === "trapezoid" ||
    value === "manual-input" ||
    value === "hexagon" ||
    value === "internal-storage" ||
    value === "or-junction" ||
    value === "summing-junction" ||
    value === "cylinder-horizontal" ||
    value === "page-corner" ||
    value === "icon"
  );
}

function isSectionTint(value: unknown): value is CanvasSectionTint {
  return (
    value === "green" ||
    value === "purple" ||
    value === "orange" ||
    value === "yellow" ||
    value === "gray" ||
    value === "white" ||
    value === "pink" ||
    value === "red" ||
    value === "blue" ||
    value === "teal"
  );
}

/**
 * `direction: "left" | "right"` acceptance (W2, reused W5) for the 3 shapes
 * that point/skew horizontally: arrow-shape, chevron, parallelogram.
 */
function isArrowShapeDirection(value: unknown): value is "left" | "right" {
  return value === "left" || value === "right";
}

/** `direction: "up" | "down"` acceptance for `triangle` (W5). */
function isTriangleDirection(value: unknown): value is "up" | "down" {
  return value === "up" || value === "down";
}

function isCanvasIconGlyph(value: unknown): value is CanvasIconGlyph {
  return (
    value === "activity" ||
    value === "archive" ||
    value === "key" ||
    value === "chat" ||
    value === "cloud" ||
    value === "cpu" ||
    value === "database" ||
    value === "display" ||
    value === "mail" ||
    value === "file" ||
    value === "code" ||
    value === "bolt" ||
    value === "pin" ||
    value === "phone" ||
    value === "package" ||
    value === "coin" ||
    value === "shield" ||
    value === "send" ||
    value === "server" ||
    value === "cube" ||
    value === "gear" ||
    value === "drive" ||
    value === "terminal" ||
    value === "person" ||
    value === "wallet" ||
    value === "globe"
  );
}

function isPaletteToken(value: unknown): value is CanvasPaletteToken {
  return (
    value === "process" ||
    value === "input" ||
    value === "hot" ||
    value === "memory" ||
    value === "note"
  );
}

function isConnectionStyle(value: unknown): value is CanvasConnectionStyle {
  return value === "solid" || value === "dotted" || value === "elbow" || value === "smooth";
}

function isSectionStrokeStyle(value: unknown): value is CanvasSectionStrokeStyle {
  return value === "solid" || value === "dashed" || value === "none";
}

function isArrow(value: unknown): value is CanvasArrowDirection {
  return value === "none" || value === "forward" || value === "back" || value === "both";
}

function validateGeometry(
  value: unknown,
  path: string,
  issues: CanvasValidationIssue[],
): CanvasGeometry | null {
  if (!isRecord(value)) {
    issues.push({ path, message: "Geometry must be an object." });
    return null;
  }
  const x = value.x;
  const y = value.y;
  const width = value.width;
  const height = value.height;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    issues.push({ path, message: "Geometry requires finite x, y, width, and height." });
    return null;
  }
  if (width <= 0 || height <= 0) {
    issues.push({ path, message: "Geometry width and height must be positive." });
    return null;
  }
  return { x, y, width, height };
}

function validateUniqueId(
  id: unknown,
  path: string,
  ids: Set<string>,
  issues: CanvasValidationIssue[],
): string | null {
  if (!isId(id)) {
    issues.push({ path, message: "ID must be stable ASCII and start with a letter or number." });
    return null;
  }
  if (ids.has(id)) {
    issues.push({ path, message: `Duplicate ID: ${id}` });
    return null;
  }
  ids.add(id);
  return id;
}

/** Validates a value is a 2-tuple of finite numbers within [0, 1] (inclusive). */
function isUnitTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    value[0] >= 0 &&
    value[0] <= 1 &&
    value[1] >= 0 &&
    value[1] <= 1
  );
}

/** Validates a value is a 2-tuple of finite numbers (unrestricted range). */
function isFiniteTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1])
  );
}

function normalizeEndpoint(
  value: unknown,
  path: string,
  objectIds: Set<string>,
  issues: CanvasValidationIssue[],
): CanvasConnectionEndpoint | null {
  if (!isRecord(value) || !isId(value.objectId)) {
    issues.push({ path, message: "Connection endpoint must contain an objectId." });
    return null;
  }
  if (!objectIds.has(value.objectId)) {
    issues.push({ path, message: `Unknown endpoint objectId: ${value.objectId}` });
    return null;
  }
  const anchor = value.anchor;
  if (
    anchor !== undefined &&
    anchor !== "top" &&
    anchor !== "right" &&
    anchor !== "bottom" &&
    anchor !== "left" &&
    anchor !== "center"
  ) {
    issues.push({ path, message: "Endpoint anchor is invalid." });
    return null;
  }
  let position: [number, number] | undefined;
  if (value.position !== undefined) {
    if (!isUnitTuple(value.position)) {
      issues.push({
        path: `${path}.position`,
        message: "Endpoint position must be a [x, y] tuple of finite numbers within [0, 1].",
      });
      return null;
    }
    position = [value.position[0], value.position[1]];
  }
  return {
    objectId: value.objectId,
    anchor: anchor as CanvasConnectionEndpoint["anchor"],
    position,
  };
}

export function validateInteractiveCanvasDocument(value: unknown): CanvasValidationResult {
  const issues: CanvasValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Canvas document must be an object." }] };
  }
  if (value.schemaVersion !== 1) {
    issues.push({ path: "$.schemaVersion", message: "Canvas schemaVersion must be 1." });
  }
  if (!isId(value.id)) {
    issues.push({ path: "$.id", message: "Canvas document requires a stable id." });
  }
  if (value.mode !== "diagram") {
    issues.push({ path: "$.mode", message: "Canvas mode must be diagram." });
  }
  if (!Array.isArray(value.objects)) {
    issues.push({ path: "$.objects", message: "Canvas objects must be an array." });
  }
  if (!Array.isArray(value.connections)) {
    issues.push({ path: "$.connections", message: "Canvas connections must be an array." });
  }
  if (issues.length > 0) return { ok: false, issues };

  const warnings: CanvasValidationIssue[] = [];
  const ids = new Set<string>();
  const objectIds = new Set<string>();
  const objects: InteractiveCanvasObject[] = [];
  for (const [index, rawObject] of (value.objects as unknown[]).entries()) {
    const path = `$.objects[${index}]`;
    if (!isRecord(rawObject)) {
      issues.push({ path, message: "Object must be a record." });
      continue;
    }
    const id = validateUniqueId(rawObject.id, `${path}.id`, ids, issues);
    const geometry = validateGeometry(rawObject.geometry, `${path}.geometry`, issues);
    if (!id || !geometry) continue;
    if (!isCanvasObjectType(rawObject.type)) {
      issues.push({ path: `${path}.type`, message: "Unknown canvas object type." });
      continue;
    }
    const label = typeof rawObject.label === "string" ? rawObject.label.trim() : "";
    if (!label) {
      issues.push({ path: `${path}.label`, message: "Object label is required." });
      continue;
    }
    objectIds.add(id);
    let paletteToken: CanvasPaletteToken | undefined;
    if (isRecord(rawObject.style) && rawObject.style.paletteToken !== undefined) {
      if (isPaletteToken(rawObject.style.paletteToken)) {
        paletteToken = rawObject.style.paletteToken;
      } else {
        warnings.push({
          path: `${path}.style.paletteToken`,
          message: `Unknown paletteToken "${String(rawObject.style.paletteToken)}" was dropped.`,
        });
      }
    }

    // W4 — explicit fill/stroke/strokeWidth: optional, soft-validated (invalid
    // values are dropped with a warning, mirroring paletteToken above).
    let fill: string | undefined;
    let stroke: string | undefined;
    let strokeWidth: number | undefined;
    let strokeStyle: CanvasSectionStrokeStyle | undefined;
    if (isRecord(rawObject.style)) {
      if (rawObject.style.fill !== undefined) {
        if (typeof rawObject.style.fill === "string" && rawObject.style.fill.trim().length > 0) {
          fill = rawObject.style.fill;
        } else {
          warnings.push({
            path: `${path}.style.fill`,
            message: "style.fill must be a non-empty string; it was dropped.",
          });
        }
      }
      if (rawObject.style.stroke !== undefined) {
        if (typeof rawObject.style.stroke === "string" && rawObject.style.stroke.trim().length > 0) {
          stroke = rawObject.style.stroke;
        } else {
          warnings.push({
            path: `${path}.style.stroke`,
            message: "style.stroke must be a non-empty string; it was dropped.",
          });
        }
      }
      if (rawObject.style.strokeWidth !== undefined) {
        if (isFiniteNumber(rawObject.style.strokeWidth) && rawObject.style.strokeWidth > 0) {
          strokeWidth = rawObject.style.strokeWidth;
        } else {
          warnings.push({
            path: `${path}.style.strokeWidth`,
            message: "style.strokeWidth must be a positive number; it was dropped.",
          });
        }
      }
      if (rawObject.style.strokeStyle !== undefined) {
        if (isSectionStrokeStyle(rawObject.style.strokeStyle)) {
          strokeStyle = rawObject.style.strokeStyle;
        } else {
          warnings.push({
            path: `${path}.style.strokeStyle`,
            message: "style.strokeStyle must be solid, dashed, or none; it was dropped.",
          });
        }
      }
    }

    // W2 — section requires title + a known tint family; both are hard
    // validation errors (not warnings) since a section with no tint/title
    // can't be rendered at all.
    let title: string | undefined;
    let tint: CanvasSectionTint | undefined;
    if (rawObject.type === "section") {
      title = typeof rawObject.title === "string" ? rawObject.title.trim() : "";
      if (!title) {
        issues.push({ path: `${path}.title`, message: "Section requires a title." });
        continue;
      }
      if (!isSectionTint(rawObject.tint)) {
        issues.push({ path: `${path}.tint`, message: "Section requires a known tint family." });
        continue;
      }
      tint = rawObject.tint;
    }

    // W2 — arrow-shape direction defaults to "right" when omitted/invalid
    // (non-fatal: a chevron pointing right is a reasonable default, not worth
    // rejecting the whole document over). W5 generalizes the same soft-default
    // pattern to parallelogram/chevron (left|right, default "right") and
    // triangle (up|down, default "up") — each type only accepts its own
    // 2-value subset of CanvasShapeDirection.
    let direction: CanvasShapeDirection | undefined;
    if (
      rawObject.type === "arrow-shape" ||
      rawObject.type === "parallelogram" ||
      rawObject.type === "chevron"
    ) {
      direction = isArrowShapeDirection(rawObject.direction) ? rawObject.direction : "right";
    } else if (rawObject.type === "triangle") {
      direction = isTriangleDirection(rawObject.direction) ? rawObject.direction : "up";
    }

    // W5 — icon requires a known glyph id; hard validation error (not a
    // warning) since an icon object with no resolvable glyph can't be
    // rendered at all (mirrors the section title/tint precedent above).
    let icon: CanvasIconGlyph | undefined;
    if (rawObject.type === "icon") {
      if (!isCanvasIconGlyph(rawObject.icon)) {
        issues.push({ path: `${path}.icon`, message: "Icon requires a known glyph id." });
        continue;
      }
      icon = rawObject.icon;
    }

    objects.push({
      id,
      type: rawObject.type,
      label,
      body: typeof rawObject.body === "string" ? rawObject.body : undefined,
      parentId: typeof rawObject.parentId === "string" ? rawObject.parentId : null,
      geometry,
      style: isRecord(rawObject.style)
        ? {
            tone:
              typeof rawObject.style.tone === "string"
                ? (rawObject.style.tone as InteractiveCanvasTone)
                : undefined,
            shape:
              typeof rawObject.style.shape === "string"
                ? (rawObject.style.shape as CanvasObjectStyle["shape"])
                : undefined,
            paletteToken,
            fill,
            stroke,
            strokeWidth,
            strokeStyle,
          }
        : undefined,
      layout: isRecord(rawObject.layout)
        ? {
            mode:
              rawObject.layout.mode === "row" ||
              rawObject.layout.mode === "column" ||
              rawObject.layout.mode === "stack"
                ? rawObject.layout.mode
                : "free",
            padding: isFiniteNumber(rawObject.layout.padding)
              ? rawObject.layout.padding
              : undefined,
            gap: isFiniteNumber(rawObject.layout.gap) ? rawObject.layout.gap : undefined,
          }
        : undefined,
      source: isRecord(rawObject.source)
        ? {
            path: typeof rawObject.source.path === "string" ? rawObject.source.path : undefined,
            symbol:
              typeof rawObject.source.symbol === "string" ? rawObject.source.symbol : undefined,
            section:
              typeof rawObject.source.section === "string" ? rawObject.source.section : undefined,
          }
        : undefined,
      title,
      tint,
      locked: typeof rawObject.locked === "boolean" ? rawObject.locked : undefined,
      contentHidden: typeof rawObject.contentHidden === "boolean" ? rawObject.contentHidden : undefined,
      direction,
      language: typeof rawObject.language === "string" ? rawObject.language : undefined,
      author: typeof rawObject.author === "string" ? rawObject.author : undefined,
      icon,
    });
  }

  for (const object of objects) {
    if (object.parentId && !objectIds.has(object.parentId)) {
      issues.push({
        path: `$.objects.${object.id}.parentId`,
        message: `Unknown parent object: ${object.parentId}`,
      });
    }
  }
  const objectById = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const visited = new Set<string>([object.id]);
    let parentId = object.parentId ?? null;
    while (parentId) {
      if (visited.has(parentId)) {
        issues.push({
          path: `$.objects.${object.id}.parentId`,
          message: "Parent cycle detected.",
        });
        break;
      }
      visited.add(parentId);
      parentId = objectById.get(parentId)?.parentId ?? null;
    }
  }

  const connections: InteractiveCanvasConnection[] = [];
  for (const [index, rawConnection] of (value.connections as unknown[]).entries()) {
    const path = `$.connections[${index}]`;
    if (!isRecord(rawConnection)) {
      issues.push({ path, message: "Connection must be a record." });
      continue;
    }
    const id = validateUniqueId(rawConnection.id, `${path}.id`, ids, issues);
    const from = normalizeEndpoint(rawConnection.from, `${path}.from`, objectIds, issues);
    const to = normalizeEndpoint(rawConnection.to, `${path}.to`, objectIds, issues);
    if (!id || !from || !to) continue;

    let waypoints: Array<[number, number]> | undefined;
    if (rawConnection.waypoints !== undefined) {
      if (!Array.isArray(rawConnection.waypoints)) {
        issues.push({ path: `${path}.waypoints`, message: "Connection waypoints must be an array." });
        continue;
      }
      const normalizedWaypoints: Array<[number, number]> = [];
      let waypointsValid = true;
      for (const [waypointIndex, rawWaypoint] of rawConnection.waypoints.entries()) {
        if (!isFiniteTuple(rawWaypoint)) {
          issues.push({
            path: `${path}.waypoints[${waypointIndex}]`,
            message: "Waypoint must be a [x, y] tuple of finite numbers.",
          });
          waypointsValid = false;
          break;
        }
        normalizedWaypoints.push([rawWaypoint[0], rawWaypoint[1]]);
      }
      if (!waypointsValid) continue;
      waypoints = normalizedWaypoints;
    }

    connections.push({
      id,
      from,
      to,
      label: typeof rawConnection.label === "string" ? rawConnection.label : undefined,
      style: isConnectionStyle(rawConnection.style) ? rawConnection.style : "solid",
      arrow: isArrow(rawConnection.arrow) ? rawConnection.arrow : "forward",
      role: typeof rawConnection.role === "string" ? rawConnection.role : undefined,
      color:
        typeof rawConnection.color === "string" && rawConnection.color.trim() !== ""
          ? rawConnection.color
          : undefined,
      waypoints,
    });
  }

  const links: InteractiveCanvasLink[] = [];
  if (Array.isArray(value.links)) {
    for (const [index, rawLink] of value.links.entries()) {
      const path = `$.links[${index}]`;
      if (!isRecord(rawLink) || !isId(rawLink.id) || typeof rawLink.objectId !== "string") {
        issues.push({ path, message: "Link requires id and objectId." });
        continue;
      }
      if (!objectIds.has(rawLink.objectId)) {
        issues.push({ path, message: `Unknown linked object: ${rawLink.objectId}` });
        continue;
      }
      const target = rawLink.target;
      if (!isRecord(target) || typeof target.path !== "string") {
        issues.push({ path: `${path}.target`, message: "Link target requires a path." });
        continue;
      }
      links.push({
        id: rawLink.id,
        objectId: rawLink.objectId,
        target: {
          kind: target.kind === "doc" ? "doc" : "source",
          path: target.path,
          symbol: typeof target.symbol === "string" ? target.symbol : undefined,
          line: isFiniteNumber(target.line) ? target.line : undefined,
          section: typeof target.section === "string" ? target.section : undefined,
          label: typeof target.label === "string" ? target.label : undefined,
        },
        status:
          rawLink.status === "resolved" ||
          rawLink.status === "stale" ||
          rawLink.status === "missing"
            ? rawLink.status
            : "unresolved",
        checkedAt: typeof rawLink.checkedAt === "string" ? rawLink.checkedAt : undefined,
      });
    }
  }

  const annotations: InteractiveCanvasAnnotation[] = [];
  if (Array.isArray(value.annotations)) {
    for (const [index, rawAnnotation] of value.annotations.entries()) {
      const path = `$.annotations[${index}]`;
      if (
        !isRecord(rawAnnotation) ||
        !isId(rawAnnotation.id) ||
        typeof rawAnnotation.body !== "string"
      ) {
        issues.push({ path, message: "Annotation requires id and body." });
        continue;
      }
      const target = rawAnnotation.target;
      if (!isRecord(target) || typeof target.kind !== "string") {
        issues.push({ path: `${path}.target`, message: "Annotation target is invalid." });
        continue;
      }
      let normalizedTarget: CanvasAnnotationTarget | null = null;
      if (target.kind === "object" && typeof target.objectId === "string") {
        if (!objectIds.has(target.objectId)) {
          issues.push({ path, message: `Unknown annotation object: ${target.objectId}` });
          continue;
        }
        normalizedTarget = { kind: "object", objectId: target.objectId };
      } else if (target.kind === "connection" && typeof target.connectionId === "string") {
        normalizedTarget = { kind: "connection", connectionId: target.connectionId };
      } else if (target.kind === "region") {
        const region = validateGeometry(target.region, `${path}.target.region`, issues);
        if (!region) continue;
        normalizedTarget = { kind: "region", region };
      }
      if (!normalizedTarget) {
        issues.push({ path: `${path}.target`, message: "Unsupported annotation target." });
        continue;
      }
      annotations.push({
        id: rawAnnotation.id,
        target: normalizedTarget,
        intent: rawAnnotation.intent === "agent-request" ? "agent-request" : "note",
        body: rawAnnotation.body,
        status:
          rawAnnotation.status === "applied" || rawAnnotation.status === "resolved"
            ? rawAnnotation.status
            : "open",
        createdBy:
          rawAnnotation.createdBy === "agent" || rawAnnotation.createdBy === "system"
            ? rawAnnotation.createdBy
            : "human",
        createdAt:
          typeof rawAnnotation.createdAt === "string" ? rawAnnotation.createdAt : undefined,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    document: {
      schemaVersion: 1,
      id: value.id as string,
      title: typeof value.title === "string" ? value.title : undefined,
      mode: "diagram",
      viewport: isRecord(value.viewport)
        ? {
            x: isFiniteNumber(value.viewport.x) ? value.viewport.x : 0,
            y: isFiniteNumber(value.viewport.y) ? value.viewport.y : 0,
            zoom: isFiniteNumber(value.viewport.zoom) ? value.viewport.zoom : 1,
          }
        : undefined,
      size: isRecord(value.size)
        ? {
            width: isFiniteNumber(value.size.width) ? value.size.width : 1200,
            height: isFiniteNumber(value.size.height) ? value.size.height : 720,
          }
        : undefined,
      objects,
      connections,
      links,
      annotations,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function assertInteractiveCanvasDocument(value: unknown): InteractiveCanvasDocument {
  const validation = validateInteractiveCanvasDocument(value);
  if (validation.ok) return validation.document;
  const detail = validation.issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid interactive canvas document: ${detail}`);
}
