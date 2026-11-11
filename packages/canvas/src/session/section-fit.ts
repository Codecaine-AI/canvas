/**
 * fit_section: close a frame around what it holds, and even its rows.
 *
 * The frame keeps the same air on the left and right of what paints, and the
 * same air above (under the title band) and below, the way arrange_section
 * closes its frame. A row of three or more nodes gets equal gaps. Nothing is
 * stretched: no box changes size, and the frame is never larger than its
 * content plus that air.
 */
import { layoutNumbers } from "../board/layout-numbers";
import { routedPolyline } from "../board/lints/geometry";
import { connectionLabelChipMetrics } from "../connectors/label-chip";
import { ARROW_KEEP_OUT_PX, paintedRects } from "../connectors/label-placement";
import { CONNECTOR_END_GAP_PX } from "../connectors/routing";
import { hitBoundsForObject } from "../objects/geometry";
import { reconcileConnectionWaypoints } from "../state/actions/waypoints";
import { GEOMETRY_NORMALIZATION_GRID, sectionDescendantIds } from "../state/geometry";
import type {
  CanvasGeometry,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import { GROW_TRIGGER } from "../state/section-grow";
import { reconcileSectionMembership } from "../state/section-membership";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";

import { SECTION_FIT_PADDING } from "./apply-ops";
import { entityKindOf } from "./perception/op-surface";
import { snapRectOutward } from "./tools/grid";

type Rect = { x: number; y: number; width: number; height: number };

type Move = { id: string; geometry: CanvasGeometry };

/** What fit_section writes: each box that moves, the frame last, the rows it evened and the rows it left uneven. */
export interface SectionFit {
  readonly moves: readonly Move[];
  readonly evened: ReadonlyArray<readonly string[]>;
  readonly uneven: ReadonlyArray<{ row: readonly string[]; why: string }>;
}

/** The gap a labelled wire needs past its chip's length. The same rule as arrange_section (tools/operations/arrange.ts). */
const LABELLED_GAP_AIR_PX = 24 + ARROW_KEEP_OUT_PX + 2 * CONNECTOR_END_GAP_PX;

function union(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
    && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

function roundToWriteGrid(value: number): number {
  return Math.round(value / GEOMETRY_NORMALIZATION_GRID) * GEOMETRY_NORMALIZATION_GRID;
}

/**
 * The frame around `children`: the fit padding around what paints (a shape's
 * box, an icon's tile and caption), or more when a stored box would otherwise
 * come closer than the auto-grow trigger, which would grow the frame on one
 * side and undo the balance. `wires` (the routes between the section's own
 * boxes) keep the same distance, so a wire that loops around the boxes stays
 * inside the frame. Left and right take the larger need, and
 * so do top (under the title band) and bottom, so the content is centred. The
 * edges land on the write grid: the equal air is the gesture, so the frame
 * follows children that sit off the agent grid.
 */
function frameAround(
  children: readonly InteractiveCanvasObject[],
  wires: readonly Rect[],
  canvasStyle: CanvasStyle,
): CanvasGeometry {
  const content = union(children.flatMap((child) => paintedRects(child, canvasStyle)));
  const held = union([...children.map((child) => hitBoundsForObject(child, canvasStyle)), ...wires]);
  const { padding, titleClearance } = SECTION_FIT_PADDING;
  const side = Math.max(
    padding,
    content.x - held.x + GROW_TRIGGER.padding,
    held.x + held.width - (content.x + content.width) + GROW_TRIGGER.padding,
  );
  const upright = Math.max(
    padding,
    content.y - held.y + GROW_TRIGGER.padding + GROW_TRIGGER.titleClearance - titleClearance,
    held.y + held.height - (content.y + content.height) + GROW_TRIGGER.padding,
  );
  const top = upright + titleClearance;
  return snapRectOutward(
    {
      x: content.x - side,
      y: content.y - top,
      width: content.width + side * 2,
      height: content.height + top + upright,
    },
    GEOMETRY_NORMALIZATION_GRID,
  );
}

interface Box {
  readonly id: string;
  /** The union of what the box paints. */
  readonly rect: Rect;
  /** Its stored box and caption: what must not land on a neighbour. */
  readonly hit: Rect;
  /** Its column (the nodes that share its centre line), or -1 for a box that never moves. */
  column: number;
}

/** Rows of nodes, top to bottom: a node joins the first row whose first node it overlaps by half a height. */
function rowsOf(nodes: readonly Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const node of [...nodes].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)) {
    const row = rows.find(([seed]) => {
      const overlap = Math.min(seed!.rect.y + seed!.rect.height, node.rect.y + node.rect.height)
        - Math.max(seed!.rect.y, node.rect.y);
      return overlap >= Math.min(seed!.rect.height, node.rect.height) / 2;
    });
    if (row) row.push(node);
    else rows.push([node]);
  }
  return rows.map((row) => row.sort((a, b) => a.rect.x - b.rect.x));
}

/**
 * How far each node moves sideways so a row of three or more has equal gaps,
 * the rows that changed, and the rows left uneven with the reason.
 *
 * A node is a shape or an icon with no lock: notes and child sections stay.
 * A row is spread between its two end nodes, which hold their place. A gap a
 * labelled wire crosses never gets narrower than its label needs (or than it
 * is now, when that is less): the row then grows from its centre. Nodes that
 * share a centre line (a column) move together, so a wire that runs straight
 * down a column stays straight. The longest row goes first, and a row that
 * shares a column with a row placed before it is left as it is.
 *
 * A row is left as it is when evening it would make another row less even,
 * put a box on a neighbour it did not touch before, or `refuse` names a
 * reason.
 */
function evenRows(
  children: readonly InteractiveCanvasObject[],
  connections: readonly InteractiveCanvasConnection[],
  canvasStyle: CanvasStyle,
  refuse: (shifts: ReadonlyMap<string, number>) => string | null,
): { shifts: Map<string, number>; evened: string[][]; uneven: SectionFit["uneven"] } {
  const boxes: Box[] = children.map((child) => ({
    id: child.id,
    rect: union(paintedRects(child, canvasStyle)),
    hit: hitBoundsForObject(child, canvasStyle),
    column: -1,
  }));
  const nodes = boxes.filter((_, index) =>
    entityKindOf(children[index]!) === "shape" && children[index]!.locked === undefined);
  const centre = (node: Box) => node.rect.x + node.rect.width / 2;
  let columns = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const node of [...nodes].sort((a, b) => centre(a) - centre(b))) {
    if (centre(node) - last > GEOMETRY_NORMALIZATION_GRID) columns += 1;
    node.column = columns;
    last = centre(node);
  }
  // The room each labelled wire's chip needs between its two ends: arrange_section's rule.
  const labelled = new Map<string, number>();
  for (const { label, from, to } of connections) {
    if (!label?.trim()) continue;
    const need = connectionLabelChipMetrics(label, canvasStyle).width + LABELLED_GAP_AIR_PX;
    for (const pair of [`${from.objectId}>${to.objectId}`, `${to.objectId}>${from.objectId}`]) {
      labelled.set(pair, Math.max(need, labelled.get(pair) ?? 0));
    }
  }

  type Shifts = ReadonlyMap<number, number>;
  const none: Shifts = new Map();
  const moved = (rect: Rect, box: Box, shifts: Shifts): Rect =>
    ({ ...rect, x: rect.x + (shifts.get(box.column) ?? 0) });
  const gapsOf = (row: readonly Box[], shifts: Shifts): number[] =>
    row.slice(1).map((node, index) => {
      const before = moved(row[index]!.rect, row[index]!, shifts);
      return moved(node.rect, node, shifts).x - (before.x + before.width);
    });
  const spreadOf = (row: readonly Box[], shifts: Shifts): number => {
    const gaps = gapsOf(row, shifts);
    return Math.max(...gaps) - Math.min(...gaps);
  };
  const byNode = (shifts: Shifts): Map<string, number> =>
    new Map(nodes.flatMap((node) => (shifts.get(node.column) ? [[node.id, shifts.get(node.column)!]] : [])));
  const rows = rowsOf(nodes).filter((row) => row.length >= 3);
  const harm = (shifts: Shifts): string | null => {
    if (rows.some((row) => spreadOf(row, shifts) > Math.max(spreadOf(row, none), GEOMETRY_NORMALIZATION_GRID))) {
      return "another row would get less even";
    }
    const lands = boxes.some((box, index) =>
      boxes.some((other, at) =>
        at > index
        && intersects(moved(box.hit, box, shifts), moved(other.hit, other, shifts))
        && !intersects(box.hit, other.hit)));
    return lands ? "a box would land on its neighbour" : refuse(byNode(shifts));
  };

  let placed: Shifts = none;
  const evened: string[][] = [];
  const why = new Map<Box[], string>();
  for (const row of [...rows].sort((a, b) => b.length - a.length)) {
    if (spreadOf(row, placed) <= GEOMETRY_NORMALIZATION_GRID) continue;
    if (row.some((node) => placed.has(node.column))) {
      why.set(row, "it shares a centerline with a row that moved");
      continue;
    }
    const gaps = gapsOf(row, none);
    const free = gaps.reduce((sum, value) => sum + value, 0);
    let gap = free / gaps.length;
    gaps.forEach((value, index) => {
      gap = Math.max(gap, Math.min(value, labelled.get(`${row[index]!.id}>${row[index + 1]!.id}`) ?? 0));
    });
    const trial = new Map(placed);
    let x = row[0]!.rect.x - (gap * gaps.length - free) / 2;
    for (const node of row) {
      const shift = roundToWriteGrid(x - node.rect.x);
      trial.set(node.column, shift);
      x = node.rect.x + shift + node.rect.width + gap;
    }
    const reason = gap <= 0 ? "its nodes overlap" : harm(trial);
    if (reason) {
      why.set(row, reason);
      continue;
    }
    placed = trial;
    evened.push(row.map((node) => node.id));
  }
  return {
    shifts: byNode(placed),
    evened,
    uneven: rows
      .filter((row) => spreadOf(row, placed) > GEOMETRY_NORMALIZATION_GRID)
      .map((row) => ({ row: row.map((node) => node.id), why: why.get(row)! })),
  };
}

/**
 * Resolve fit_section against the draft. Membership is derived from geometry,
 * so the frame's children are read off a reconciled copy. The fit writes the
 * nodes it moved and that one frame: no ancestor is touched. Returns a note
 * when there is nothing to fit.
 *
 * Evening a row never costs more than the plain fit: the frame stays inside
 * the space the section had or the plain fit takes, and no wire crossing is
 * added on the board.
 */
export function resolveFitSection(
  document: InteractiveCanvasDocument,
  sectionId: string,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SectionFit | { note: string } {
  const section = document.objects.find((object) => object.id === sectionId);
  if (!section || section.type !== "section") {
    return { note: `skipped — no section "${sectionId}" on the board` };
  }
  const members = reconcileSectionMembership(document);
  const children = members.objects.filter((object) => object.parentId === sectionId);
  if (children.length === 0) {
    return { note: "skipped — the section is empty, and a frame with no children has nothing to fit around; size it with resize instead" };
  }

  const inside = sectionDescendantIds(members, sectionId);
  const own = document.connections.filter(({ from, to }) => inside.has(from.objectId) && inside.has(to.objectId));
  const boardWith = (moves: readonly Move[]): InteractiveCanvasDocument => {
    const geometry = new Map(moves.map((move) => [move.id, move.geometry]));
    return reconcileConnectionWaypoints(document, {
      ...document,
      objects: document.objects.map((object) =>
        geometry.has(object.id) ? { ...object, geometry: geometry.get(object.id)! } : object),
    });
  };
  const fitted = (shifts: ReadonlyMap<string, number>): Move[] => {
    const nodes = children.flatMap(({ id, geometry }) =>
      shifts.get(id) ? [{ id, geometry: { ...geometry, x: geometry.x + shifts.get(id)! } }] : []);
    const board = boardWith(nodes);
    const wires = own.flatMap((connection) =>
      routedPolyline(connection, board, canvasStyle).map((point) => ({ ...point, width: 0, height: 0 })));
    const placed = board.objects.filter((object) => children.some((child) => child.id === object.id));
    return [...nodes, { id: sectionId, geometry: frameAround(placed, wires, canvasStyle) }];
  };
  const crossings = (moves: readonly Move[]): number => layoutNumbers(boardWith(moves), canvasStyle).crossings;
  const plain = fitted(new Map());
  const room = union([section.geometry, plain.at(-1)!.geometry]);
  let fewest = crossings(plain);
  const { shifts, evened, uneven } = evenRows(children, document.connections, canvasStyle, (trial) => {
    const moves = fitted(trial);
    const frame = moves.at(-1)!.geometry;
    if (
      frame.x < room.x || frame.y < room.y
      || frame.x + frame.width > room.x + room.width || frame.y + frame.height > room.y + room.height
    ) return "the frame would grow";
    const count = crossings(moves);
    if (count > fewest) return "a wire crossing would be added";
    fewest = count;
    return null;
  });
  return { moves: fitted(shifts), evened, uneven };
}
