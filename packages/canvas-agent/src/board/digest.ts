/**
 * Text renderings of a real InteractiveCanvasDocument for model-visible board
 * state: an indented object tree (indentation = containment) and global edges.
 * Lossless over the op-writable surface — every writable field is either
 * rendered when set or covered by the declared elided defaults, taught in the
 * <state_grammar> context block (test/digest-completeness.test.ts is the
 * gate). User annotations are NOT
 * part of the digest; they travel in the separate <user_requests> block.
 *
 * The type column speaks the FOLDED vocabulary (service/session/
 * placeable-types.ts): the same names `place_shape` and `change_shape` accept,
 * so a row can be edited by reading it. The document's `{type:"icon", icon}`
 * split never appears — the glyph name is the type.
 */
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../../canvas/src/state/schema/object-defaults";

import { fromDocumentFields } from "../service/session/tools/placeable-types";
import { formatNumberedRoute } from "./edge-route";
import { kindOf, pageFrameOf } from "./helpers";

/**
 * The digest itself carries bare values — no legend lines. Its grammar is
 * taught by the <state_grammar> context block, which quotes the three
 * constants below verbatim so the reading key can never drift from the lines
 * this file renders. Elision stays lossless: every elided field is covered by
 * the declared defaults.
 */
export const DIGEST_DEFAULTS_LEGEND =
  "elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type";

/**
 * The numbered-segment notation: `sN` is the segment index `shift_segment`
 * takes, `h`/`v` its orientation, and the printed coordinate is the one a
 * shift rewrites (a horizontal segment is pinned by its y, a vertical one by
 * its x).
 */
export const DIGEST_ROUTE_LEGEND =
  "edge route after ·: ─(sN h y=…)→ horizontal · (sN v x=…) vertical · sN = shift_segment index";

/** The object-line grammar. */
export const DIGEST_GRAMMAR =
  'id type "text" [color] x,y w×h [k=v…]';

function fmt(value: number): string {
  return String(Math.round(value));
}

/**
 * `fmt` rounds to whole world units, which is right for px and fatal for a
 * 0..1 fraction (0.35 would print as 0). Fractions print at two decimals with
 * trailing zeros trimmed, so 0.5 reads as "0.5" and 1 as "1".
 */
function fmtFraction(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function rect(object: InteractiveCanvasObject): string {
  const { x, y, width, height } = object.geometry;
  return `${fmt(x)},${fmt(y)} ${fmt(width)}×${fmt(height)}`;
}

/**
 * One-line rendering of a text field: whitespace (including newlines)
 * collapses to single spaces, but the full text always renders — the digest
 * is the model's only text source, so nothing is elided. Tolerates a missing
 * field: the digest formats whatever document it is handed and must never
 * throw mid-session.
 */
function oneLine(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
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
  if (object.author !== undefined) extras.push(`author=${JSON.stringify(oneLine(object.author))}`);
  return extras;
}

function objectLine(object: InteractiveCanvasObject, depth: number): string {
  // The FOLDED name, never the raw `type`: a glyph object is `memory`, not
  // `icon` with an `icon=memory` extra beside it. The glyph is not a second
  // field the model has to read — the name IS the drawing.
  const parts = [object.id, fromDocumentFields(object), JSON.stringify(oneLine(object.text))];
  if (object.color !== undefined && object.color !== defaultColorFor(object)) {
    parts.push(object.color);
  }
  parts.push(rect(object));
  parts.push(...objectExtras(object));
  return `${"  ".repeat(depth)}${parts.join(" ")}`;
}

function objectTreeLines(document: InteractiveCanvasDocument): string[] {
  const lines: string[] = [];
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
      lines.push(`${"  ".repeat(depth + 1)}(empty)`);
    }
    children.forEach((child) => visit(child, depth + 1));
  };
  const roots = childrenByParent.get(null) ?? [];
  if (document.objects.length === 0) {
    lines.push("(no objects)");
  } else {
    roots.forEach((root) => visit(root, 0));
    // Containment cycles cannot survive membership reconciliation, but the
    // digest must never silently drop an object if one ever appears.
    document.objects.forEach((object) => visit(object, 0));
  }

  return lines;
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
  if (connection.from.anchor !== undefined || connection.to.anchor !== undefined) {
    extras.push(`anchors=${endpointAnchor(connection, "from")}→${endpointAnchor(connection, "to")}`);
  }
  if (connection.from.position !== undefined || connection.to.position !== undefined) {
    extras.push(`pos=${endpointPosition(connection, "from")}→${endpointPosition(connection, "to")}`);
  }
  if (connection.waypoints !== undefined && connection.waypoints.length > 0) {
    extras.push(`wp=${connection.waypoints.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join("→")}`);
  }
  // The label-chip pin, elided at its default (absent = routed midpoint):
  // `lp=<along>` or `lp=<along>@<offset>` when the chip is pushed off the wire.
  if (connection.labelPosition !== undefined) {
    const { along, offset } = connection.labelPosition;
    extras.push(
      offset === undefined || offset === 0
        ? `lp=${fmtFraction(along)}`
        : `lp=${fmtFraction(along)}@${fmt(offset)}`,
    );
  }
  return extras;
}

/**
 * `id from→to "label" [extras…]` and then, after a `·`, the ROUTED truth as
 * numbered segments (`edge-route.ts` — the same string the ROUTES block and
 * the routing ops print, so a segment index never means two things). The
 * stored `wp=` extra stays: it is what the document holds, while the route is
 * what the router drew from it.
 */
function edgeLine(
  connection: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
): string {
  const label = connection.label !== undefined && connection.label !== ""
    ? JSON.stringify(oneLine(connection.label))
    : "—";
  const parts = [
    connection.id,
    `${connection.from.objectId}→${connection.to.objectId}`,
    label,
    ...edgeExtras(connection),
  ];
  const route = formatNumberedRoute(connection, document);
  return `${parts.join(" ")}${route === "" ? "" : ` · ${route}`}`;
}

export function formatBoardObjectsDigest(document: InteractiveCanvasDocument): string {
  const lines = objectTreeLines(document);
  if (!pageFrameOf(document)) lines.unshift("(no base section)");
  return lines.join("\n");
}

export function formatBoardEdgesDigest(document: InteractiveCanvasDocument): string {
  if (document.connections.length === 0) return "";
  return document.connections
    .map((connection) => edgeLine(connection, document))
    .join("\n");
}

export function formatBoardDigest(document: InteractiveCanvasDocument): string {
  const lines: string[] = [];
  const frame = pageFrameOf(document);
  const frameNote = frame ? "" : " · no base section";
  lines.push(`BOARD${frameNote}`);

  lines.push(...objectTreeLines(document).map((line) => `  ${line}`));

  lines.push("EDGES");
  if (document.connections.length === 0) {
    lines.push("  (none)");
  } else {
    document.connections.forEach((connection) => lines.push(`  ${edgeLine(connection, document)}`));
  }

  return lines.join("\n");
}
