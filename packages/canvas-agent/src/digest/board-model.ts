/**
 * Board digest (v4 diagnostic layout, Phase 1) — the typed relational model
 * of the current draft plus its text rendering (the BOARD block).
 *
 * BoardModel replaces fit_scope's program echo as the model's structural
 * view: facts from data, screenshots for judgment (design §3a). The
 * interfaces here are FROZEN by v4-build-spec.md — Phase-2 rule agents code
 * against them sight-unseen; do not change shapes without a spec revision.
 *
 * `parentId` is read as stored: the harness applies
 * reconcileSectionMembership on every mutation, so stored membership is the
 * geometry-derived truth by the time a draft reaches this module.
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

export interface BoardNode {
  id: string; type: string; color?: string; text: string;
  x: number; y: number; width: number; height: number;
  parentId: string | null;             // section membership (geometry-derived, as stored)
  kind: "section" | "sticky" | "annotationish" | "node";  // annotationish: annotation-marker
  locked?: "all" | "background";
}

export interface BoardEdge {
  id: string; fromId: string; toId: string;
  label?: string; style?: "solid" | "dashed"; color?: string; arrow?: string;
  waypoints?: [number, number][];      // as stored; may be absent
}

export interface BoardModel {
  frame: { x: number; y: number; width: number; height: number } | null;  // locked background section rect
  nodes: BoardNode[];                  // ALL objects incl. sections/stickies (kind discriminates)
  edges: BoardEdge[];
  childrenOf(id: string): BoardNode[];
  byId(id: string): BoardNode | undefined;
  siblingsOf(id: string): BoardNode[]; // same parentId, excluding self, excluding stickies/annotationish
}

function kindOf(type: string): BoardNode["kind"] {
  if (type === "section") return "section";
  if (type === "sticky") return "sticky";
  if (type === "annotation-marker") return "annotationish";
  return "node";
}

export function buildBoardModel(doc: InteractiveCanvasDocument): BoardModel {
  const nodes: BoardNode[] = doc.objects.map((object) => ({
    id: object.id,
    type: object.type,
    ...(object.color !== undefined ? { color: object.color } : {}),
    text: object.text,
    x: object.geometry.x,
    y: object.geometry.y,
    width: object.geometry.width,
    height: object.geometry.height,
    parentId: object.parentId ?? null,
    kind: kindOf(object.type),
    ...(object.locked !== undefined ? { locked: object.locked } : {}),
  }));
  const edges: BoardEdge[] = doc.connections.map((connection) => ({
    id: connection.id,
    fromId: connection.from.objectId,
    toId: connection.to.objectId,
    ...(connection.label !== undefined ? { label: connection.label } : {}),
    ...(connection.style !== undefined ? { style: connection.style } : {}),
    ...(connection.color !== undefined ? { color: connection.color } : {}),
    ...(connection.arrow !== undefined ? { arrow: connection.arrow } : {}),
    ...(connection.waypoints !== undefined
      ? { waypoints: connection.waypoints.map(([x, y]) => [x, y] as [number, number]) }
      : {}),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lockedFrames = nodes.filter(
    (node) => node.kind === "section" && node.locked === "background",
  );
  const frameNode = lockedFrames.find((node) => node.parentId === null) ?? lockedFrames[0];
  const frame = frameNode
    ? { x: frameNode.x, y: frameNode.y, width: frameNode.width, height: frameNode.height }
    : null;
  return {
    frame,
    nodes,
    edges,
    childrenOf: (id) => nodes.filter((node) => node.parentId === id),
    byId: (id) => byId.get(id),
    siblingsOf: (id) => {
      const self = byId.get(id);
      if (!self) return [];
      return nodes.filter((node) =>
        node.id !== id
        && (node.parentId ?? null) === (self.parentId ?? null)
        && node.kind !== "sticky"
        && node.kind !== "annotationish");
    },
  };
}

// ---------------------------------------------------------------------------
// Digest formatting — the BOARD block (design §3a)
// ---------------------------------------------------------------------------

function fmt(value: number): string {
  return String(Math.round(value));
}

function rect(node: BoardNode): string {
  return `${fmt(node.x)},${fmt(node.y)} ${fmt(node.width)}×${fmt(node.height)}`;
}

/** One-line, length-bounded rendering of an object's text field. */
function clip(text: string, max = 64): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function colorOf(node: BoardNode): string {
  return node.color ?? (node.kind === "sticky" ? "yellow" : "gray");
}

export function formatBoardDigest(model: BoardModel): string {
  const lines: string[] = [];
  lines.push(model.frame
    ? `BOARD · frame ${fmt(model.frame.x)},${fmt(model.frame.y)} ${fmt(model.frame.width)}×${fmt(model.frame.height)} (locked)`
    : "BOARD · no locked frame");

  const sections = model.nodes.filter((node) => node.kind === "section");
  const sectionIds = new Set(sections.map((section) => section.id));
  lines.push("SECTIONS");
  if (sections.length === 0) {
    lines.push("  (none)");
  } else {
    const roots = sections.filter(
      (section) => section.parentId === null || !sectionIds.has(section.parentId),
    );
    const visit = (section: BoardNode, depth: number): void => {
      const indent = "  ".repeat(depth + 1);
      const lock = section.locked ? ` locked=${section.locked}` : "";
      lines.push(
        `${indent}${section.id} ${JSON.stringify(clip(section.text))} (${colorOf(section)}) ${rect(section)}${lock}`,
      );
      const children = sections.filter((candidate) => candidate.parentId === section.id);
      if (children.length === 0 && depth === 0) {
        lines.push(`${indent}  └─ (no subsections)`);
      }
      children.forEach((child) => visit(child, depth + 1));
    };
    roots.forEach((section) => visit(section, 0));
  }

  const plainNodes = model.nodes.filter((node) => node.kind === "node");
  lines.push('NODES  # id · type · color · "text" · x,y w×h · in=section');
  if (plainNodes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const node of plainNodes) {
      const membership = node.parentId !== null ? `  in=${node.parentId}` : "";
      lines.push(
        `  ${node.id}  ${node.type}  ${colorOf(node)}  ${JSON.stringify(clip(node.text))}  ${rect(node)}${membership}`,
      );
    }
  }

  lines.push('EDGES  # id · from→to · "label" · style/color');
  if (model.edges.length === 0) {
    lines.push("  (none)");
  } else {
    for (const edge of model.edges) {
      const label = edge.label !== undefined && edge.label !== ""
        ? JSON.stringify(clip(edge.label))
        : "—";
      const arrow = edge.arrow !== undefined && edge.arrow !== "forward"
        ? ` arrow=${edge.arrow}`
        : "";
      lines.push(
        `  ${edge.id}  ${edge.fromId}→${edge.toId}  ${label}  ${edge.style ?? "solid"} ${edge.color ?? "gray"}${arrow}`,
      );
    }
  }

  const stickies = model.nodes.filter(
    (node) => node.kind === "sticky" || node.kind === "annotationish",
  );
  lines.push("STICKIES / ANNOTATIONS");
  if (stickies.length === 0) {
    lines.push("  (none)");
  } else {
    for (const node of stickies) {
      const membership = node.parentId !== null ? `  in=${node.parentId}` : "";
      lines.push(
        `  ${node.id}  ${node.type}  ${colorOf(node)}  ${JSON.stringify(clip(node.text))}  ${rect(node)}${membership}`,
      );
    }
  }

  return lines.join("\n");
}
