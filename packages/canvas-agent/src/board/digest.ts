/**
 * Text rendering of a real InteractiveCanvasDocument for the model-visible
 * BOARD context block: an indented object tree (indentation = containment)
 * followed by one global EDGES block. Lossless over the op-writable surface —
 * every writable field is either rendered when set or covered by the
 * header-declared elided defaults (test/digest-completeness.test.ts is the
 * gate). User annotations are NOT part of the digest; they travel in the
 * separate <user_requests> block.
 */
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../../canvas/src/state/schema/object-defaults";

import { kindOf, pageFrameOf } from "./helpers";

/** Elided defaults, declared once in the digest header so elision is lossless. */
export const DIGEST_DEFAULTS_LEGEND =
  "elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type";

const DIGEST_GRAMMAR =
  '# indent = containment · id type "text" [color] x,y w×h [k=v…]';

function fmt(value: number): string {
  return String(Math.round(value));
}

function rect(object: InteractiveCanvasObject): string {
  const { x, y, width, height } = object.geometry;
  return `${fmt(x)},${fmt(y)} ${fmt(width)}×${fmt(height)}`;
}

/**
 * One-line, length-bounded rendering of a text field. Truncation is visible
 * (`…(+Nch)`) so elided length is never silent; `inspect` carries full text.
 */
function clip(text: string, max = 64): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  const kept = oneLine.slice(0, max - 1);
  return `${kept}…(+${oneLine.length - kept.length}ch)`;
}

function defaultColorFor(object: InteractiveCanvasObject): string {
  return kindOf(object) === "sticky" ? "yellow" : "gray";
}

/** [extras] for an object line — only fields that are set and non-default. */
function objectExtras(object: InteractiveCanvasObject): string[] {
  const extras: string[] = [];
  if (object.locked !== undefined) extras.push(`locked=${object.locked}`);
  const defaultShape = OBJECT_TYPE_DEFAULTS[object.type]?.shape;
  if (object.style?.shape !== undefined && object.style.shape !== defaultShape) {
    extras.push(`shape=${object.style.shape}`);
  }
  if (object.layout !== undefined) {
    const parts: string[] = [object.layout.mode];
    if (object.layout.padding !== undefined) parts.push(`pad=${object.layout.padding}`);
    if (object.layout.gap !== undefined) parts.push(`gap=${object.layout.gap}`);
    extras.push(`layout=${parts.join(",")}`);
  }
  if (object.direction !== undefined) extras.push(`dir=${object.direction}`);
  if (object.icon !== undefined) extras.push(`icon=${object.icon}`);
  if (object.author !== undefined) extras.push(`author=${JSON.stringify(clip(object.author, 32))}`);
  return extras;
}

function objectLine(object: InteractiveCanvasObject, depth: number): string {
  const parts = [object.id, object.type, JSON.stringify(clip(object.text))];
  if (object.color !== undefined && object.color !== defaultColorFor(object)) {
    parts.push(object.color);
  }
  parts.push(rect(object));
  parts.push(...objectExtras(object));
  return `${"  ".repeat(depth + 1)}${parts.join(" ")}`;
}

function endpointAnchor(connection: InteractiveCanvasConnection, side: "from" | "to"): string {
  return connection[side].anchor ?? "auto";
}

function endpointPosition(connection: InteractiveCanvasConnection, side: "from" | "to"): string {
  const position = connection[side].position;
  return position ? `${position[0]},${position[1]}` : "auto";
}

/** [extras] for an edge line — style/color/arrow elided at their defaults. */
function edgeExtras(connection: InteractiveCanvasConnection): string[] {
  const extras: string[] = [];
  if (connection.style !== undefined && connection.style !== "solid") {
    extras.push(connection.style);
  }
  if (connection.color !== undefined && connection.color !== "gray") {
    extras.push(connection.color);
  }
  if (connection.arrow !== undefined && connection.arrow !== "forward") {
    extras.push(`arrow=${connection.arrow}`);
  }
  if (connection.role !== undefined) {
    extras.push(`role=${JSON.stringify(clip(connection.role, 32))}`);
  }
  if (connection.from.anchor !== undefined || connection.to.anchor !== undefined) {
    extras.push(`anchors=${endpointAnchor(connection, "from")}→${endpointAnchor(connection, "to")}`);
  }
  if (connection.from.position !== undefined || connection.to.position !== undefined) {
    extras.push(`pos=${endpointPosition(connection, "from")}→${endpointPosition(connection, "to")}`);
  }
  if (connection.waypoints !== undefined && connection.waypoints.length > 0) {
    extras.push(`wp=${connection.waypoints.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join("→")}`);
  }
  return extras;
}

function edgeLine(connection: InteractiveCanvasConnection): string {
  const label = connection.label !== undefined && connection.label !== ""
    ? JSON.stringify(clip(connection.label))
    : "—";
  const parts = [
    connection.id,
    `${connection.from.objectId}→${connection.to.objectId}`,
    label,
    ...edgeExtras(connection),
  ];
  return `  ${parts.join(" ")}`;
}

export function formatBoardDigest(document: InteractiveCanvasDocument): string {
  const lines: string[] = [];
  const frame = pageFrameOf(document);
  const frameNote = frame ? "" : " · no locked frame";
  lines.push(`BOARD${frameNote}  ${DIGEST_GRAMMAR} · ${DIGEST_DEFAULTS_LEGEND}`);

  const knownIds = new Set(document.objects.map((object) => object.id));
  const childrenByParent = new Map<string | null, InteractiveCanvasObject[]>();
  for (const object of document.objects) {
    const parent = object.parentId != null && knownIds.has(object.parentId)
      ? object.parentId
      : null;
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(object);
    else childrenByParent.set(parent, [object]);
  }

  const visited = new Set<string>();
  const visit = (object: InteractiveCanvasObject, depth: number): void => {
    if (visited.has(object.id)) return;
    visited.add(object.id);
    lines.push(objectLine(object, depth));
    const children = childrenByParent.get(object.id) ?? [];
    if (children.length === 0 && kindOf(object) === "section") {
      lines.push(`${"  ".repeat(depth + 2)}(empty)`);
    }
    children.forEach((child) => visit(child, depth + 1));
  };
  const roots = childrenByParent.get(null) ?? [];
  if (document.objects.length === 0) {
    lines.push("  (no objects)");
  } else {
    roots.forEach((root) => visit(root, 0));
    // Containment cycles cannot survive membership reconciliation, but the
    // digest must never silently drop an object if one ever appears.
    document.objects.forEach((object) => visit(object, 0));
  }

  lines.push("EDGES");
  if (document.connections.length === 0) {
    lines.push("  (none)");
  } else {
    document.connections.forEach((connection) => lines.push(edgeLine(connection)));
  }

  return lines.join("\n");
}
