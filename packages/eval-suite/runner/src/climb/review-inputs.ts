/**
 * What a reviewer reads (critic.ts asks it): the review units of a board, the
 * wire sheet of a unit, the marks the runner draws on a unit's images and the
 * text blocks. Ford: "I think the reviewer should definitely see the whole
 * board so it gets context. I think it should be able to see each of the
 * sections cropped", "if it's given a section, it also then gets to see the
 * like, all of the arrows".
 *
 * Every number comes from the board file and the engine's routes (wires.ts).
 * A mark is SVG in board coordinates, painted over a crop (crop.ts).
 */
import type { WorldRect } from "./render.ts";
import type { Point, WireFact } from "./wires.ts";

export interface BoardObject {
  id: string; type: string; text?: string; color?: string; icon?: unknown; parentId?: string | null; geometry: WorldRect; style?: { shape?: string };
}
export interface BoardConnection { id: string; from: { objectId: string }; to: { objectId: string }; label?: string }
export interface Board { objects: BoardObject[]; connections: BoardConnection[] }

/**
 * The 6 kinds of reviewer. section: one section. gap: the gutters between
 * sections, at full size. wire: the wires between sections. space: where the
 * sections sit. choices: colour, shape and icon against the brief. loose: the
 * items in no section.
 */
export const REVIEWER_KINDS = ["section", "gap", "wire", "space", "choices", "loose"] as const;
export type ReviewerKind = (typeof REVIEWER_KINDS)[number];

/** The unit ids of the reviewers that have no section. A section reviewer's unit id is its section's id, a gap reviewer's is gap-1, gap-2, ... */
export const SPACE_UNIT = "space";
export const WIRE_UNIT = "wires";
export const CHOICES_UNIT = "choices";
export const LOOSE_UNIT = "loose";

/** A reviewer's highlight of a fault as the board is now, in board coordinates: a box round it, or a path along the stretch of wire at fault. */
export type Mark = { path: Array<[number, number]> } | { box: WorldRect };
/** The frame of a mark. */
export const markBox = (mark: Mark): WorldRect => "box" in mark ? mark.box
  : bounds(mark.path.map(([x, y]) => ({ x, y, width: 0, height: 0 })));

/** One reviewer's part of the board. */
export interface ReviewUnit {
  /** SPACE_UNIT, WIRE_UNIT, CHOICES_UNIT, a section's id, gap-<n> or LOOSE_UNIT. */
  id: string;
  kind: ReviewerKind;
  /** The section a section reviewer has, or null. */
  section: BoardObject | null;
  /** The objects it owns: a section's direct children (it owns the placement of a child section, not its contents), the loose items, or the sections for the space reviewer. */
  owned: BoardObject[];
  /** Every object in a section or loose unit, at any depth: a wire with an end here starts or ends in the unit. */
  inside: ReadonlySet<string>;
  /** The board rect the unit's images frame. */
  rect: WorldRect;
  /** A gap reviewer's crops. Empty for the other kinds. */
  crops: WorldRect[];
}

const SECTION = "section";

export function bounds(rects: WorldRect[]): WorldRect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y };
}
export const grow = (rect: WorldRect, by: number): WorldRect =>
  ({ x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by });

/**
 * The reviewers of a board, the gap reviewers aside (gaps.ts cuts those).
 * Each object belongs to the deepest section that holds it. A page frame gets
 * no reviewer: the only root section, when it holds sections. Every other
 * section gets one, and owns its direct children. The items at the root and
 * in the page frame that are not sections go to one "loose items" reviewer.
 * The space reviewer comes first, then the wire reviewer (when the board has
 * a wire), the choices reviewer, the sections in board order and the loose
 * items.
 */
export function reviewUnits(board: Board): { pageFrame: BoardObject | null; units: ReviewUnit[] } {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const parentOf = (object: BoardObject) => (object.parentId ? byId.get(object.parentId) : undefined) ?? null;
  const childrenOf = (id: string) => board.objects.filter((object) => parentOf(object)?.id === id);
  const sections = board.objects.filter((object) => object.type === SECTION);
  const roots = sections.filter((section) => parentOf(section) === null);
  const only = roots.length === 1 ? roots[0]! : null;
  const pageFrame = only && childrenOf(only.id).some((child) => child.type === SECTION) ? only : null;

  const below = (id: string): string[] => childrenOf(id).flatMap((child) => [child.id, ...below(child.id)]);
  const placed = board.objects.filter((object) => object.geometry);
  const rect = placed.length ? bounds(placed.map((object) => object.geometry)) : { x: 0, y: 0, width: 1, height: 1 };
  const whole = { section: null, inside: new Set<string>(), rect, crops: [] };
  const units: ReviewUnit[] = [
    { ...whole, id: SPACE_UNIT, kind: "space", owned: sections.filter((section) => section !== pageFrame) },
    ...(board.connections.length ? [{ ...whole, id: WIRE_UNIT, kind: "wire" as const, owned: [] }] : []),
    { ...whole, id: CHOICES_UNIT, kind: "choices", owned: placed },
  ];
  for (const section of sections) {
    if (section === pageFrame) continue;
    units.push({ id: section.id, kind: "section", section, owned: childrenOf(section.id), inside: new Set([section.id, ...below(section.id)]), rect: section.geometry, crops: [] });
  }
  const loose = placed.filter((object) => object.type !== SECTION && (parentOf(object) === null || parentOf(object) === pageFrame));
  if (loose.length) {
    units.push({ id: LOOSE_UNIT, kind: "loose", section: null, owned: loose, inside: new Set(loose.map((object) => object.id)), rect: bounds(loose.map((object) => object.geometry)), crops: [] });
  }
  return { pageFrame, units };
}

/** The section or loose unit of each object: a reviewed section is its own, any other object is its parent section's or the loose items'. */
export function ownerUnits(units: ReviewUnit[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const unit of units) {
    if (unit.kind !== "section" && unit.kind !== "loose") continue;
    if (unit.section) owner.set(unit.id, unit.id);
    for (const object of unit.owned) if (object.type !== SECTION) owner.set(object.id, unit.id);
  }
  return owner;
}

/** One row of a wire sheet (design 4.3). */
export interface WireRow {
  /** W1, W2, ...: the tag of the wire in the unit's wire view. */
  tag: string;
  /** A section or the loose items: inside, leaves, enters or passes through. The wire reviewer: the 2 units the wire joins. */
  kind: string;
  fact: WireFact;
}

export interface Segment { a: Point; b: Point }
export const segmentsOf = (points: Point[]): Segment[] => points.slice(1).map((b, index) => ({ a: points[index]!, b }));

/** Whether a straight run has a part strictly inside `rect` (Liang-Barsky). */
export function runsThrough({ a, b }: Segment, rect: WorldRect): boolean {
  let [enter, leave] = [0, 1];
  const edges: Array<[number, number]> = [
    [a.x - b.x, a.x - (rect.x + 1)], [b.x - a.x, rect.x + rect.width - 1 - a.x],
    [a.y - b.y, a.y - (rect.y + 1)], [b.y - a.y, rect.y + rect.height - 1 - a.y],
  ];
  for (const [direction, distance] of edges) {
    if (direction === 0) { if (distance < 0) return false; continue; }
    const at = distance / direction;
    if (direction < 0) enter = Math.max(enter, at); else leave = Math.min(leave, at);
  }
  return enter < leave;
}

/**
 * A section's or the loose items' wire sheet: one row per wire that starts in, ends in or
 * passes through it, in board order. A wire passes through a section when its
 * route crosses the section's box and neither end is in it. The loose items
 * have no box, so no wire passes through them.
 */
export function wireSheet(unit: ReviewUnit, facts: WireFact[]): WireRow[] {
  const rows: Array<Omit<WireRow, "tag">> = [];
  for (const fact of facts) {
    const [starts, ends] = [unit.inside.has(fact.from), unit.inside.has(fact.to)];
    const kind = starts && ends ? "inside" : starts ? "leaves" : ends ? "enters"
      : unit.section && segmentsOf(fact.points).some((segment) => runsThrough(segment, unit.rect)) ? "passes through" : null;
    if (kind) rows.push({ kind, fact });
  }
  return rows.map((row, index) => ({ tag: `W${index + 1}`, ...row }));
}

/**
 * The wire reviewer's wire sheet: the wires that leave their section (their 2
 * ends have different owners). A board where no wire does, a flat board, gives
 * every wire.
 */
export function boardWireSheet(units: ReviewUnit[], facts: WireFact[]): WireRow[] {
  const owner = ownerUnits(units);
  const of = (id: string) => owner.get(id) ?? "root";
  const leaving = facts.filter((fact) => of(fact.from) !== of(fact.to));
  return (leaving.length ? leaving : facts).map((fact, index) => ({ tag: `W${index + 1}`, kind: `${of(fact.from)} → ${of(fact.to)}`, fact }));
}

export const short = (text: string | undefined, max = 60) => {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const at = (point: Point) => `(${point.x}, ${point.y})`;

/** A wire sheet as text: 2 lines a wire, with every field of design 4.3. */
export function wireSheetLines(rows: WireRow[]): string[] {
  const tagOf = new Map(rows.map((row) => [row.fact.id, row.tag]));
  const named = (ids: string[]) => ids.length ? ids.map((id) => tagOf.has(id) ? `${tagOf.get(id)} ${id}` : id).join(", ") : "none";
  return rows.flatMap(({ tag, kind, fact }) => [
    [
      `${tag} ${fact.id}`, `${fact.from} → ${fact.to}`, kind, `ports ${fact.ports.from}→${fact.ports.to}`, `${fact.length} px`,
      `${fact.bends} bends`, fact.byHand ? "by hand" : "auto", `${fact.style} ${fact.colour}`, `arrow ${fact.arrow}`,
      fact.label && fact.labelAt ? `label ${JSON.stringify(short(fact.label))} at ${at(fact.labelAt)}` : "no label",
    ].join(" · "),
    `   route ${fact.route} · corners ${fact.points.map(at).join(" ")} · through ${named(fact.through)} · crosses ${named(fact.crosses)}`
    + ` · shares a trunk with ${fact.trunks.length ? fact.trunks.map((trunk) => `${named([trunk.wire])} (${trunk.length} px)`).join(", ") : "none"}`,
  ]);
}

const iconName = (icon: unknown) => typeof icon === "string" ? icon : icon === undefined ? null : "icon";
const objectLine = (object: BoardObject) => [
  object.id, object.type, object.parentId ? `in ${object.parentId}` : "in board",
  `x ${object.geometry.x} y ${object.geometry.y}`, `${object.geometry.width}×${object.geometry.height}`,
  object.color ?? "-", iconName(object.icon) ? `icon ${iconName(object.icon)}` : null, JSON.stringify(short(object.text)),
].filter(Boolean).join(" · ");

/** The objects a wire sheet joins to a unit from outside it. */
export function wiredObjects(unit: ReviewUnit, rows: WireRow[], board: Board): BoardObject[] {
  const ends = new Set(rows.filter((row) => row.kind !== "passes through").flatMap((row) => [row.fact.from, row.fact.to]));
  return board.objects.filter((object) => ends.has(object.id) && !unit.inside.has(object.id));
}

/** The objects block of a section or loose unit: its section, what it owns, and the outside ends of its wires. */
export function objectLines(unit: ReviewUnit, rows: WireRow[], board: Board): string[] {
  const outside = wiredObjects(unit, rows, board);
  return [
    "Yours (id · type · parent · x y of the top-left corner · width×height · colour · icon · text):",
    ...(unit.section ? [objectLine(unit.section)] : []),
    ...unit.owned.map(objectLine),
    ...(outside.length ? ["Wired to yours, in another reviewer's part:", ...outside.map(objectLine)] : []),
  ];
}

/** One line per reviewed section, for the space reviewer. */
export function sectionLines(units: ReviewUnit[]): string[] {
  return units.flatMap((unit) => unit.section ? [[
    unit.section.id, unit.section.parentId ? `in ${unit.section.parentId}` : "in board",
    `x ${unit.rect.x}`, `y ${unit.rect.y}`, `width ${unit.rect.width}`, `height ${unit.rect.height}`,
    `${unit.owned.filter((object) => object.type !== SECTION).length} items`, `${unit.owned.filter((object) => object.type === SECTION).length} subsections`,
    JSON.stringify(short(unit.section.text)),
  ].join(" · ")] : []);
}

/** The `MEASURES` block of a `look` result: gaps, pitch, free margins and ink share. */
export function measuresOf(lookText: string): string[] {
  const lines = lookText.split("\n");
  const start = lines.findIndex((line) => line.startsWith("MEASURES"));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("  "));
  return lines.slice(start, end < 0 ? undefined : end);
}

/** The `ROUTES` rows of a `look` result for `wires`. `look` prints every wire of the board. */
export function routesOf(lookText: string, wires: ReadonlySet<string>): string[] {
  const lines = lookText.split("\n");
  const start = lines.indexOf("ROUTES");
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("  "));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => wires.has(line.trim().split(/\s+/)[0]!));
}

// ---- Marks: SVG in board coordinates. A size in image px is divided by the crop's scale. ----

export const OWN = "#d92d20";
const LINKED = "#2563eb";
const TAG = "#be123c";
const TRUNK = "#475569";
export const FONT = `font-family="Inter, sans-serif"`;

export const outline = (rect: WorldRect, colour: string, px: number, scale: number) =>
  `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${colour}" stroke-width="${px / scale}"/>`;

/** Image 1: the unit's own boxes in red, the sections wired to it in blue. */
export function wholeBoardMarks(own: WorldRect[], linked: WorldRect[], scale: number): string {
  return [...linked.map((rect) => outline(rect, LINKED, 3, scale)), ...own.map((rect) => outline(rect, OWN, 4, scale))].join("");
}

/** The sections that hold the outside ends of a unit's wires: the blue boxes of image 1. */
export function linkedSections(unit: ReviewUnit, rows: WireRow[], board: Board, units: ReviewUnit[]): WorldRect[] {
  const owner = ownerUnits(units);
  const linked = new Set(wiredObjects(unit, rows, board).map((object) => owner.get(object.id)));
  return units.filter((other) => other.section && other !== unit && linked.has(other.id)).map((other) => other.rect);
}

/** The margins of image 2 around its unit, in image px: the ruler bands on the top and left, a plain ring elsewhere. */
const RULER = { top: 30, left: 46, ring: 24 };

/**
 * The frame of image 2 and its scale: the unit's rect with room for the ruler,
 * scaled so that neither edge is over `maxEdge` px.
 */
export function sectionFrame(rect: WorldRect, maxEdge: number, ruler: boolean): { frame: WorldRect; scale: number } {
  const [left, top] = ruler ? [RULER.left + 8, RULER.top + 8] : [RULER.ring, RULER.ring];
  const scale = Math.min(1, (maxEdge - left - RULER.ring) / rect.width, (maxEdge - top - RULER.ring) / rect.height);
  return {
    frame: { x: rect.x - left / scale, y: rect.y - top / scale, width: rect.width + (left + RULER.ring) / scale, height: rect.height + (top + RULER.ring) / scale },
    scale,
  };
}

/** How image px and board px compare in a crop, as the ruler and the prompt state it. */
export const scaleText = (scale: number) => scale === 1 ? "full size: 1 image px is 1 board px" : `scaled to ${Math.round(scale * 100)}%: 100 board px are ${Math.round(scale * 100)} image px`;

/**
 * A ruler in board coordinates on the top and left edges of `frame`: a tick
 * each 20 board px (each 100 when the crop is scaled under 40%), a number each
 * 100 or more. A chip in the bottom-right corner states the scale.
 */
export function rulerMarks(frame: WorldRect, scale: number): string {
  const px = (value: number) => value / scale;
  const [top, left] = [px(RULER.top), px(RULER.left)];
  const minor = scale >= 0.4 ? 20 : 100;
  const major = [100, 200, 500, 1000].find((step) => step * scale >= 48) ?? 1000;
  const ticks: string[] = [];
  const numbers: string[] = [];
  const steps = (from: number, to: number) => {
    const list: number[] = [];
    for (let value = Math.ceil(from / minor) * minor; value <= to; value += minor) list.push(value);
    return list;
  };
  for (const x of steps(frame.x + left, frame.x + frame.width)) {
    const long = x % major === 0 ? 12 : x % 100 === 0 ? 8 : 4;
    ticks.push(`<line x1="${x}" y1="${frame.y + top - px(long)}" x2="${x}" y2="${frame.y + top}"/>`);
    if (x % major === 0) numbers.push(`<text x="${x}" y="${frame.y + px(13)}" text-anchor="middle">${x}</text>`);
  }
  for (const y of steps(frame.y + top, frame.y + frame.height)) {
    const long = y % major === 0 ? 12 : y % 100 === 0 ? 8 : 4;
    ticks.push(`<line x1="${frame.x + left - px(long)}" y1="${y}" x2="${frame.x + left}" y2="${y}"/>`);
    if (y % major === 0) numbers.push(`<text x="${frame.x + left - px(15)}" y="${y + px(4)}" text-anchor="end">${y}</text>`);
  }
  const note = `ruler: board x, y · ${scaleText(scale)}`;
  const chip = { width: px(note.length * 6.4 + 16), height: px(22) };
  return `<g ${FONT} font-size="${px(12)}" fill="#111827" stroke="none">`
    + `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${top}" fill="#ffffff"/>`
    + `<rect x="${frame.x}" y="${frame.y}" width="${left}" height="${frame.height}" fill="#ffffff"/>`
    + `<g stroke="#111827" stroke-width="${px(1)}">${ticks.join("")}`
    + `<line x1="${frame.x + left}" y1="${frame.y + top}" x2="${frame.x + frame.width}" y2="${frame.y + top}"/>`
    + `<line x1="${frame.x + left}" y1="${frame.y + top}" x2="${frame.x + left}" y2="${frame.y + frame.height}"/></g>`
    + numbers.join("")
    + `<text x="${frame.x + px(4)}" y="${frame.y + px(13)}" font-weight="700">x→ y↓</text>`
    + `<rect x="${frame.x + frame.width - chip.width}" y="${frame.y + frame.height - chip.height}" width="${chip.width}" height="${chip.height}" fill="#111827"/>`
    + `<text x="${frame.x + frame.width - chip.width / 2}" y="${frame.y + frame.height - px(7)}" text-anchor="middle" fill="#ffffff">${note}</text>`
    + `</g>`;
}

/** The label chips of a wire sheet, as the board paints them. */
const chipsOf = (rows: WireRow[]): WorldRect[] => rows.flatMap((row) => row.fact.chip ? [row.fact.chip] : []);

/** The frame of images 3 and 4: the unit, every object wired to it and the full path of every wire on its sheet, with a ring. */
export function neighbourhoodFrame(unit: ReviewUnit, rows: WireRow[], board: Board): WorldRect {
  const points = rows.flatMap((row) => row.fact.points).map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 }));
  const kept = unit.section ? [unit.rect] : unit.owned.map((object) => object.geometry);
  return grow(bounds([...kept, ...wiredObjects(unit, rows, board).map((object) => object.geometry), ...points, ...chipsOf(rows)]), 40);
}

/**
 * The rest of the board faded. A white veil covers `frame`, with holes for
 * the unit, the objects wired to it, and a corridor along each wire of its
 * sheet and around each label chip. The unit's section is outlined in red.
 * The wire reviewer's unit holds no object, so its holes are the 2 ends of
 * each wire on its sheet.
 */
export function fadeMarks(unit: ReviewUnit, rows: WireRow[], board: Board, frame: WorldRect, scale: number): string {
  const box = (rect: WorldRect) => `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}"/>`;
  const kept = unit.section ? [unit.rect] : unit.owned.map((object) => grow(object.geometry, 6));
  const holes = [
    ...kept.map(box),
    ...wiredObjects(unit, rows, board).map((object) => box(grow(object.geometry, 6))),
    ...chipsOf(rows).map((chip) => box(grow(chip, 2))),
    ...rows.map((row) => `<polyline points="${row.fact.points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#000000" stroke-width="32" stroke-linecap="square" stroke-linejoin="miter"/>`),
  ];
  return `<defs><mask id="review-keep" maskUnits="userSpaceOnUse" x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}">`
    + `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" fill="#ffffff"/><g fill="#000000">${holes.join("")}</g></mask></defs>`
    + `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" fill="#ffffff" fill-opacity="0.72" mask="url(#review-keep)"/>`
    + (unit.section ? outline(unit.rect, OWN, 4, scale) : unit.owned.map((object) => outline(object.geometry, OWN, 3, scale)).join(""));
}

export interface Run { axis: "h" | "v"; fixed: number; from: number; to: number }
/** A straight run along an axis, or null for a diagonal one. */
function runOf({ a, b }: Segment): Run | null {
  if (a.y === b.y) return { axis: "h", fixed: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
  if (a.x === b.x) return { axis: "v", fixed: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  return null;
}
export const runsOf = (points: Point[]) => segmentsOf(points).flatMap((segment) => runOf(segment) ?? []);
const overlap = (a: Run, b: Run): [number, number] | null => {
  if (a.axis !== b.axis || Math.abs(a.fixed - b.fixed) >= 1) return null;
  const [from, to] = [Math.max(a.from, b.from), Math.min(a.to, b.to)];
  return to - from > 0 ? [from, to] : null;
};

/** The longest stretch of `run` that no run of `others` lies on. */
function ownStretch(run: Run, others: Run[]): [number, number] {
  const shared = others.flatMap((other) => overlap(run, other) ? [overlap(run, other)!] : []).sort((a, b) => a[0] - b[0]);
  let best: [number, number] = [run.from, run.from];
  let cursor = run.from;
  for (const [from, to] of [...shared, [run.to, run.to] as [number, number]]) {
    if (from - cursor > best[1] - best[0]) best = [cursor, from];
    cursor = Math.max(cursor, to);
  }
  return best;
}

/** A shared trunk: the wires that lie on one line for more than `TRUNK_TAG_MIN` px. */
interface Trunk { run: Run; members: Set<number> }
const TRUNK_TAG_MIN = 20;

function trunksOf(rows: WireRow[]): Trunk[] {
  const runs = rows.map((row) => runsOf(row.fact.points));
  const pieces: Trunk[] = [];
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
    for (const a of runs[i]!) for (const b of runs[j]!) {
      const shared = overlap(a, b);
      if (shared && shared[1] - shared[0] > TRUNK_TAG_MIN) pieces.push({ run: { ...a, from: shared[0], to: shared[1] }, members: new Set([i, j]) });
    }
  }
  pieces.sort((a, b) => a.run.axis.localeCompare(b.run.axis) || a.run.fixed - b.run.fixed || a.run.from - b.run.from);
  const merged: Trunk[] = [];
  for (const piece of pieces) {
    const last = merged.at(-1);
    if (last && last.run.axis === piece.run.axis && Math.abs(last.run.fixed - piece.run.fixed) < 1 && piece.run.from <= last.run.to) {
      last.run.to = Math.max(last.run.to, piece.run.to);
      for (const member of piece.members) last.members.add(member);
    } else merged.push({ run: { ...piece.run }, members: new Set(piece.members) });
  }
  // One tag a set of wires: on its longest run.
  const byMembers = new Map<string, Trunk>();
  for (const trunk of merged) {
    const key = [...trunk.members].sort((a, b) => a - b).join("+");
    const held = byMembers.get(key);
    if (!held || trunk.run.to - trunk.run.from > held.run.to - held.run.from) byMembers.set(key, trunk);
  }
  return [...byMembers.values()];
}

export const touches = (a: WorldRect, b: WorldRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * The wire view's marks: a tag on each wire (W1, ...), a ring on each bend, a
 * square on each port, and one grey tag on each shared trunk that names its
 * wires (W5+W6+W7). A wire's tag sits beside the longest stretch that is its
 * own, clear of the tags placed before it.
 */
export function wireMarks(rows: WireRow[], scale: number): string {
  const px = (value: number) => value / scale;
  const marks: string[] = [];
  // A tag stays off the label chips, and off the tags placed before it.
  const placed: WorldRect[] = chipsOf(rows);
  const tag = (text: string, colour: string, run: Run | null, stretch: [number, number], middle: Point) => {
    // Inter bold at 18 px: a W is 17.5 px wide, a digit or a plus 11.5 px.
    const [width, height] = [px([...text].reduce((sum, letter) => sum + (letter === "W" ? 17.5 : 11.5), 14)), px(24)];
    // Beside the line: above a horizontal run, right of a vertical one. The other side and other places along it are the fallbacks.
    const spots: WorldRect[] = [];
    for (const side of [-1, 1]) for (const along of [0.25, 0.5, 0.75]) {
      const spot = run ? stretch[0] + (stretch[1] - stretch[0]) * along : 0;
      const centre = !run ? { x: middle.x + side * -(width / 2 + px(8)), y: middle.y }
        : run.axis === "h" ? { x: spot, y: run.fixed + side * (height / 2 + px(8)) }
        : { x: run.fixed - side * (width / 2 + px(8)), y: spot };
      spots.push({ x: centre.x - width / 2, y: centre.y - height / 2, width, height });
    }
    const rect = spots.find((spot) => !placed.some((other) => touches(spot, other))) ?? spots[0]!;
    placed.push(rect);
    marks.push(
      `<rect x="${rect.x}" y="${rect.y}" width="${width}" height="${height}" rx="${px(3)}" fill="${colour}" stroke="#ffffff" stroke-width="${px(1.5)}"/>`
      + `<text x="${rect.x + width / 2}" y="${rect.y + height / 2 + px(6.5)}" ${FONT} font-size="${px(18)}" font-weight="700" text-anchor="middle" fill="#ffffff" stroke="none">${text}</text>`,
    );
  };
  for (const [index, row] of rows.entries()) {
    const points = row.fact.points;
    for (const corner of points.slice(1, -1)) {
      marks.push(`<circle cx="${corner.x}" cy="${corner.y}" r="${px(9)}" fill="none" stroke="${TAG}" stroke-width="${px(2.5)}"/>`);
    }
    for (const port of [points[0]!, points.at(-1)!]) {
      marks.push(`<rect x="${port.x - px(6)}" y="${port.y - px(6)}" width="${px(12)}" height="${px(12)}" fill="#ffffff" stroke="${TAG}" stroke-width="${px(2.5)}"/>`);
    }
    const others = rows.flatMap((other, at) => at === index ? [] : runsOf(other.fact.points));
    const own = runsOf(points).map((run) => ({ run, stretch: ownStretch(run, others) }))
      .reduce<{ run: Run; stretch: [number, number] } | null>((best, entry) =>
        !best || entry.stretch[1] - entry.stretch[0] > best.stretch[1] - best.stretch[0] ? entry : best, null);
    const [first, last] = [points[0]!, points.at(-1)!];
    tag(row.tag, TAG, own?.run ?? null, own?.stretch ?? [0, 0], { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 });
  }
  for (const trunk of trunksOf(rows)) {
    const text = [...trunk.members].sort((a, b) => a - b).map((member) => rows[member]!.tag).join("+");
    tag(text, TRUNK, trunk.run, [trunk.run.from, trunk.run.to], { x: 0, y: 0 });
  }
  return marks.join("");
}

/**
 * The section map of the space reviewer, a whole SVG: each reviewed section as a box
 * with its title and id, and a line between 2 sections that wires join, with
 * the number of wires.
 */
export function sectionMapSvg(units: ReviewUnit[], facts: WireFact[], camera: WorldRect, width: number): string {
  const scale = width / camera.width;
  const px = (value: number) => value / scale;
  const sections = units.filter((unit) => unit.section);
  const rectOf = new Map(sections.map((unit) => [unit.id, unit.rect]));
  const owner = ownerUnits(units);
  const links = new Map<string, { a: string; b: string; wires: number }>();
  for (const fact of facts) {
    const [a, b] = [owner.get(fact.from), owner.get(fact.to)].sort();
    if (!a || !b || a === b || !rectOf.has(a) || !rectOf.has(b)) continue;
    const link = links.get(`${a}\n${b}`) ?? { a, b, wires: 0 };
    link.wires += 1;
    links.set(`${a}\n${b}`, link);
  }
  const centre = (rect: WorldRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  /** Where the line from `rect`'s centre towards `to` leaves `rect`. */
  const exit = (rect: WorldRect, to: Point): Point => {
    const from = centre(rect);
    const [dx, dy] = [to.x - from.x, to.y - from.y];
    const share = Math.min(dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx), dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy), 1);
    return { x: from.x + dx * share, y: from.y + dy * share };
  };
  const lines: string[] = [];
  const chips: string[] = [];
  for (const link of links.values()) {
    const [a, b] = [rectOf.get(link.a)!, rectOf.get(link.b)!];
    const [from, to] = [exit(a, centre(b)), exit(b, centre(a))];
    lines.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#6b7280" stroke-width="${px(Math.min(12, 2 + 2 * (link.wires - 1)))}"/>`);
    const text = `${link.wires} ${link.wires === 1 ? "wire" : "wires"}`;
    const [chipWidth, chipHeight] = [px(text.length * 7.4 + 12), px(20)];
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    chips.push(
      `<rect x="${middle.x - chipWidth / 2}" y="${middle.y - chipHeight / 2}" width="${chipWidth}" height="${chipHeight}" fill="#111827"/>`
      + `<text x="${middle.x}" y="${middle.y + px(4.5)}" font-size="${px(13)}" font-weight="700" text-anchor="middle" fill="#ffffff">${text}</text>`,
    );
  }
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const boxes = sections.map((unit) => {
    const rect = unit.rect;
    const fit = (text: string, glyph: number) => short(text, Math.max(4, Math.floor((rect.width * scale - 16) / glyph)));
    return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="#eef2ff" fill-opacity="0.85" stroke="#2f6fde" stroke-width="${px(2)}"/>`
      + `<text x="${rect.x + px(8)}" y="${rect.y + px(20)}" font-size="${px(14)}" font-weight="700" fill="#111827">${escape(fit(unit.section!.text ?? "", 8))}</text>`
      + `<text x="${rect.x + px(8)}" y="${rect.y + px(37)}" font-size="${px(12)}" fill="#374151">${escape(fit(unit.id, 7))}</text>`;
  });
  const height = Math.round(camera.height * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${camera.x} ${camera.y} ${camera.width} ${camera.height}" ${FONT}>`
    + `<rect x="${camera.x}" y="${camera.y}" width="${camera.width}" height="${camera.height}" fill="#ffffff"/>`
    + `${boxes.join("")}${lines.join("")}${chips.join("")}</svg>`;
}

/** The frame of one "look further" view: the named objects and the full paths of the named wires, with a 128 px ring. Null when no id is on the board. */
export function lookFrame(ids: string[], board: Board, facts: WireFact[]): WorldRect | null {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const wires = new Map(facts.map((fact) => [fact.id, fact]));
  const rects = ids.flatMap((id): WorldRect[] => {
    const object = byId.get(id);
    if (object?.geometry) return [object.geometry];
    return (wires.get(id)?.points ?? []).map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 }));
  });
  return rects.length ? grow(bounds(rects), 128) : null;
}

// ---- Measured facts: what the wire, gap, space and choices reviewers read beside their images. ----

/** A wire hugs a border when it runs within BORDER_NEAR_PX of it along BORDER_RUN_MIN_PX or more. */
export const BORDER_NEAR_PX = 24;
export const BORDER_RUN_MIN_PX = 100;
/** Wires that share an end and run side by side on 2 lines, this near, read as 2 lanes where one trunk would do. */
export const LANE_NEAR_PX = 40;
const LANE_RUN_MIN_PX = 60;
/** A gap is tight when more than 1 wire per this many px of its width runs along it. */
export const GAP_PX_PER_WIRE = 40;
/** The space reviewer gets each wire longer than this. */
export const LONG_WIRE_PX = 800;
/** The most lines one kind of measure prints. */
const MAX_LINES = 24;

const capped = (lines: string[]) => lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `(and ${lines.length - MAX_LINES} more of this kind)`] : lines;
const pointOn = (run: Run, along: number): Point => run.axis === "h" ? { x: along, y: run.fixed } : { x: run.fixed, y: along };
const span = (rect: WorldRect) => `x ${Math.round(rect.x)} to ${Math.round(rect.x + rect.width)}, y ${Math.round(rect.y)} to ${Math.round(rect.y + rect.height)}`;

type SideName = "top" | "bottom" | "left" | "right";
const sidesOf = (rect: WorldRect): Array<Run & { name: SideName }> => [
  { name: "top", axis: "h", fixed: rect.y, from: rect.x, to: rect.x + rect.width },
  { name: "bottom", axis: "h", fixed: rect.y + rect.height, from: rect.x, to: rect.x + rect.width },
  { name: "left", axis: "v", fixed: rect.x, from: rect.y, to: rect.y + rect.height },
  { name: "right", axis: "v", fixed: rect.x + rect.width, from: rect.y, to: rect.y + rect.height },
];

/** A stretch of a wire, as a measure names it. */
export interface Stretch { wire: string; length: number; from: Point; to: Point }
export interface BorderRun extends Stretch { section: string; side: SideName; distance: number }

/** The stretches where a wire runs along a section border. */
export function borderRuns(facts: WireFact[], sections: BoardObject[]): BorderRun[] {
  const found: BorderRun[] = [];
  for (const fact of facts) for (const run of runsOf(fact.points)) for (const section of sections) for (const side of sidesOf(section.geometry)) {
    if (side.axis !== run.axis) continue;
    const distance = Math.abs(run.fixed - side.fixed);
    const [from, to] = [Math.max(run.from, side.from), Math.min(run.to, side.to)];
    if (distance > BORDER_NEAR_PX || to - from < BORDER_RUN_MIN_PX) continue;
    found.push({ wire: fact.id, section: section.id, side: side.name, distance: Math.round(distance), length: Math.round(to - from), from: pointOn(run, from), to: pointOn(run, to) });
  }
  return found;
}

export interface Lane extends Stretch { other: string; distance: number; shared: { end: "source" | "target"; id: string } | null }

/**
 * The pairs of wires that run side by side on 2 lines, at most `near` px
 * apart for `minRun` px or more: the longest such stretch of each pair.
 * `shared` is the node both start from or both end on.
 */
export function closeLanes(facts: WireFact[], near: number, minRun: number): Lane[] {
  const runs = facts.map((fact) => runsOf(fact.points));
  const lanes: Lane[] = [];
  for (let i = 0; i < facts.length; i += 1) for (let j = i + 1; j < facts.length; j += 1) {
    const [a, b] = [facts[i]!, facts[j]!];
    let best: Lane | null = null;
    for (const first of runs[i]!) for (const second of runs[j]!) {
      if (first.axis !== second.axis) continue;
      const distance = Math.abs(first.fixed - second.fixed);
      const [from, to] = [Math.max(first.from, second.from), Math.min(first.to, second.to)];
      if (distance < 1 || distance > near || to - from < minRun || (best && best.length >= to - from)) continue;
      const shared = a.to === b.to ? { end: "target" as const, id: a.to } : a.from === b.from ? { end: "source" as const, id: a.from } : null;
      best = { wire: a.id, other: b.id, distance: Math.round(distance), length: Math.round(to - from), shared, from: pointOn(first, from), to: pointOn(first, to) };
    }
    if (best) lanes.push(best);
  }
  return lanes;
}

/**
 * The stretches where a wire runs round the outside of the board: clear of
 * every section, off the line of its own 2 ends, with objects on one side of
 * it and nothing on the other.
 */
export function outerEdgeRuns(facts: WireFact[], board: Board, pageFrame: BoardObject | null): Array<Stretch & { side: SideName }> {
  const placed = board.objects.filter((object) => object.geometry && object !== pageFrame);
  const sections = placed.filter((object) => object.type === SECTION);
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const found: Array<Stretch & { side: SideName }> = [];
  for (const fact of facts) for (const run of runsOf(fact.points)) {
    if (run.to - run.from < BORDER_RUN_MIN_PX) continue;
    const segment = { a: pointOn(run, run.from), b: pointOn(run, run.to) };
    if (sections.some((section) => runsThrough(segment, section.geometry))) continue;
    // Across the run: y for a horizontal run, x for a vertical one.
    const across = (rect: WorldRect): [number, number] => run.axis === "h" ? [rect.y, rect.y + rect.height] : [rect.x, rect.x + rect.width];
    const along = (rect: WorldRect): [number, number] => run.axis === "h" ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
    const direct = [fact.from, fact.to].some((id) => {
      const end = byId.get(id)?.geometry;
      return end && across(end)[0] <= run.fixed && run.fixed <= across(end)[1];
    });
    if (direct) continue;
    const beside = placed.filter((object) => along(object.geometry)[0] < run.to && along(object.geometry)[1] > run.from);
    const [before, after] = [beside.some((object) => across(object.geometry)[0] < run.fixed), beside.some((object) => across(object.geometry)[1] > run.fixed)];
    if (before === after) continue;
    const side: SideName = run.axis === "h" ? (before ? "bottom" : "top") : (before ? "right" : "left");
    found.push({ wire: fact.id, side, length: Math.round(run.to - run.from), from: segment.a, to: segment.b });
  }
  return found;
}

/** What the measures of a wire sheet need beside its rows. */
export interface WireContext {
  board: Board;
  pageFrame: BoardObject | null;
  /** The header chip of each section that paints one (wires.ts sectionHeaders). */
  headers: ReadonlyMap<string, WorldRect>;
}

/**
 * What the runner measured on the wires of a sheet, one line a fact: a wire
 * along a section border or the board's outer edge, through a section's
 * header chip, with an end on a section frame, and 2 wires of one node in
 * separate close lanes. A line is a fact to judge on the image, not a fault.
 */
export function wireMeasureLines(rows: WireRow[], context: WireContext): string[] {
  const { board, pageFrame, headers } = context;
  const facts = rows.map((row) => row.fact);
  const tagOf = new Map(rows.map((row) => [row.fact.id, row.tag]));
  const name = (id: string) => `${tagOf.get(id)} ${id}`;
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const sections = board.objects.filter((object) => object.type === SECTION && object.geometry);
  const frame = (id: string) => id === pageFrame?.id ? `the board frame ${id}` : `section ${id}`;
  const stretch = (run: Stretch) => `from ${at(run.from)} to ${at(run.to)}`;
  return [
    ...capped(borderRuns(facts, sections).map((run) => `${name(run.wire)} runs ${run.length} px at ${run.distance} px from the ${run.side} border of ${frame(run.section)}, ${stretch(run)}`)),
    ...capped(outerEdgeRuns(facts, board, pageFrame).map((run) => `${name(run.wire)} runs ${run.length} px along the outer ${run.side} edge of the board, ${stretch(run)}: no object lies beyond it`)),
    ...capped(facts.flatMap((fact) => [...headers].filter(([, header]) => segmentsOf(fact.points).some((segment) => runsThrough(segment, header)))
      .map(([section, header]) => `${name(fact.id)} runs through the header chip of section ${section} (${span(header)})`))),
    ...capped(facts.flatMap((fact) => ([["starts", fact.from, fact.points[0]!], ["ends", fact.to, fact.points.at(-1)!]] as const)
      .filter(([, id]) => byId.get(id)?.type === SECTION)
      .map(([verb, id, point]) => `${name(fact.id)} ${verb} on the frame of section ${id} at ${at(point)}, not on a node`))),
    ...capped(closeLanes(facts, LANE_NEAR_PX, LANE_RUN_MIN_PX).filter((lane) => lane.shared)
      .map((lane) => `${name(lane.wire)} and ${name(lane.other)} both ${lane.shared!.end === "target" ? "end on" : "start from"} ${lane.shared!.id} and run ${lane.length} px in 2 lanes ${lane.distance} px apart, ${stretch(lane)}`)),
  ];
}

/** The gutter between 2 sections that face each other with no section between them. */
export interface SectionGap {
  a: string;
  b: string;
  side: "side by side" | "stacked";
  /** The px between the 2 facing borders. */
  gap: number;
  gutter: WorldRect;
  /** The wires that run along the gutter for 40 px or more. */
  wires: string[];
  /** The label chips in the gutter. */
  chips: number;
  /** More than 1 wire per GAP_PX_PER_WIRE px of the gap. */
  tight: boolean;
}

const FACING_MIN_PX = 40;

/** The gap between each pair of neighbour sections, in board order. A section and one it holds are not neighbours. */
export function sectionGaps(units: ReviewUnit[], facts: WireFact[]): SectionGap[] {
  const sections = units.filter((unit) => unit.section);
  const holds = (outer: ReviewUnit, inner: ReviewUnit) => outer.inside.has(inner.id);
  const gaps: SectionGap[] = [];
  for (let i = 0; i < sections.length; i += 1) for (let j = i + 1; j < sections.length; j += 1) {
    const [a, b] = [sections[i]!, sections[j]!];
    if (holds(a, b) || holds(b, a)) continue;
    const facing = (lowA: number, highA: number, lowB: number, highB: number) => [Math.max(lowA, lowB), Math.min(highA, highB)] as const;
    const [x, y] = [facing(a.rect.x, a.rect.x + a.rect.width, b.rect.x, b.rect.x + b.rect.width), facing(a.rect.y, a.rect.y + a.rect.height, b.rect.y, b.rect.y + b.rect.height)];
    // The sections face each other across x (side by side) or across y (stacked): they share FACING_MIN_PX on the other axis.
    const side = y[1] - y[0] >= FACING_MIN_PX && x[0] >= x[1] ? "side by side" : x[1] - x[0] >= FACING_MIN_PX && y[0] >= y[1] ? "stacked" : null;
    if (!side) continue;
    const gutter = side === "side by side" ? { x: x[1], y: y[0], width: x[0] - x[1], height: y[1] - y[0] } : { x: x[0], y: y[1], width: x[1] - x[0], height: y[0] - y[1] };
    if (sections.some((other) => other !== a && other !== b && !holds(other, a) && !holds(other, b) && touches(other.rect, gutter))) continue;
    const gap = side === "side by side" ? gutter.width : gutter.height;
    const wires = facts.filter((fact) => runsOf(fact.points).some((run) => {
      if (run.axis !== (side === "side by side" ? "v" : "h")) return false;
      const [low, high, from, to] = side === "side by side" ? [gutter.x, gutter.x + gutter.width, gutter.y, gutter.y + gutter.height] : [gutter.y, gutter.y + gutter.height, gutter.x, gutter.x + gutter.width];
      return run.fixed > low && run.fixed < high && Math.min(run.to, to) - Math.max(run.from, from) >= 40;
    })).map((fact) => fact.id);
    gaps.push({
      a: a.id, b: b.id, side, gap, gutter, wires, chips: facts.filter((fact) => fact.chip && touches(fact.chip, gutter)).length,
      tight: wires.length > gap / GAP_PX_PER_WIRE,
    });
  }
  return gaps;
}

/** The text blocks of the space reviewer. Adjacency comes first: which sections talk, and how far apart they sit. */
export function spaceLines(units: ReviewUnit[], facts: WireFact[], board: Board): { shape: string; gaps: string[]; pairs: string[]; long: string[]; sinks: string[] } {
  const owner = ownerUnits(units);
  const byUnit = new Map(units.map((unit) => [unit.id, unit]));
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const sections = units.filter((unit) => unit.section);
  const gaps = sectionGaps(units, facts);
  const pairKey = (a: string, b: string) => [a, b].sort().join("\n");
  const gapOf = new Map(gaps.map((gap) => [pairKey(gap.a, gap.b), gap]));
  const whole = units.find((unit) => unit.kind === "space")!.rect;

  const pairs = new Map<string, { a: string; b: string; wires: number; length: number }>();
  for (const fact of facts) {
    const [a, b] = [owner.get(fact.from), owner.get(fact.to)].sort();
    if (!a || !b || a === b) continue;
    const pair = pairs.get(pairKey(a, b)) ?? { a, b, wires: 0, length: 0 };
    pair.wires += 1;
    pair.length += fact.length;
    pairs.set(pairKey(a, b), pair);
  }
  const centre = (rect: WorldRect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const where = (pair: { a: string; b: string }) => {
    const [a, b] = [byUnit.get(pair.a)!, byUnit.get(pair.b)!];
    if (!a.section || !b.section) return "one end is a loose item";
    if (a.inside.has(b.id) || b.inside.has(a.id)) return "one holds the other";
    const gap = gapOf.get(pairKey(a.id, b.id));
    if (gap) return `neighbours, ${gap.side}, gap ${gap.gap} px`;
    const line = { a: centre(a.rect), b: centre(b.rect) };
    const between = sections.filter((other) => other !== a && other !== b && ![a, b].some((end) => other.inside.has(end.id) || end.inside.has(other.id)) && runsThrough(line, other.rect));
    return `NOT neighbours${between.length ? `: ${between.map((other) => other.id).join(", ")} ${between.length === 1 ? "lies" : "lie"} between them` : ""}`;
  };

  const incoming = new Map<string, WireFact[]>();
  for (const fact of facts) {
    if (!owner.has(fact.from) || owner.get(fact.from) === owner.get(fact.to)) continue;
    incoming.set(fact.to, [...(incoming.get(fact.to) ?? []), fact]);
  }
  const named = (id: string) => `${id} (${owner.get(id) ?? "board"})`;
  return {
    shape: `${Math.round(whole.width)} × ${Math.round(whole.height)} px, aspect ratio ${(whole.width / whole.height).toFixed(2)} : 1`,
    gaps: gaps.map((gap) => [
      `${gap.a} ↔ ${gap.b}`, gap.side, `gap ${gap.gap} px`, `gutter ${span(gap.gutter)}`,
      `${gap.wires.length} ${gap.wires.length === 1 ? "wire runs" : "wires run"} along it`, `${gap.chips} ${gap.chips === 1 ? "label chip" : "label chips"} in it`,
      ...(gap.tight ? [`TIGHT: more than 1 wire per ${GAP_PX_PER_WIRE} px of gap`] : []),
    ].join(" · ")),
    pairs: [...pairs.values()].sort((a, b) => b.wires - a.wires || b.length - a.length)
      .map((pair) => `${pair.a} ↔ ${pair.b} · ${pair.wires} ${pair.wires === 1 ? "wire" : "wires"} · ${pair.length} px of wire in total · ${where(pair)}`),
    long: facts.filter((fact) => fact.length > LONG_WIRE_PX).sort((a, b) => b.length - a.length)
      .map((fact) => `${fact.id} · ${named(fact.from)} → ${named(fact.to)} · ${fact.length} px · ${fact.bends} bends`),
    sinks: [...incoming].filter(([, wires]) => wires.length >= 3).map(([id, wires]) => {
      const lengths = wires.map((wire) => wire.length);
      const from = [...new Set(wires.map((wire) => owner.get(wire.from)!))];
      return `${id} ${JSON.stringify(short(byId.get(id)?.text))} in ${owner.get(id) ?? "board"} · ${wires.length} wires in from ${from.join(", ")}`
        + ` · mean ${Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length)} px · longest ${Math.max(...lengths)} px`;
    }),
  };
}

/** An icon on this many nodes or more is listed for the choices reviewer. */
const REPEATED_ICON_MIN = 4;

/** The text blocks of the choices reviewer: each object's kind, shape, icon and colour, the wires, and what repeats. */
export function choicesLines(board: Board, facts: WireFact[]): { objects: string[]; wires: string[]; counts: string[] } {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const colour = (object: BoardObject | undefined) => object?.color ?? "no colour";
  const sections = board.objects.filter((object) => object.type === SECTION);
  const nodes = board.objects.filter((object) => object.type !== SECTION);
  const group = <T,>(items: T[], key: (item: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
    return [...groups];
  };
  const ids = (objects: BoardObject[]) => objects.map((object) => object.id).join(", ");
  return {
    objects: board.objects.map((object) => {
      const parent = object.parentId ? byId.get(object.parentId) : undefined;
      return [
        object.id, object.type, `shape ${object.style?.shape ?? "-"}`, iconName(object.icon) ? `icon ${iconName(object.icon)}` : "no icon", colour(object),
        parent ? `in ${parent.id} (${colour(parent)})` : "in board", JSON.stringify(short(object.text)),
      ].join(" · ");
    }),
    wires: facts.map((fact) => `${fact.id} · ${fact.from} → ${fact.to} · ${fact.label ? JSON.stringify(short(fact.label)) : "no label"} · ${fact.style} ${fact.colour}`),
    counts: [
      ...group(sections, colour).map(([name, members]) => `${members.length} ${members.length === 1 ? "section has" : "sections have"} colour ${name}: ${ids(members)}`),
      ...group(sections, (section) => section.parentId ?? "the board").filter(([, members]) => members.length > 1 && new Set(members.map(colour)).size === 1)
        .map(([parent, members]) => `The ${members.length} sibling sections in ${parent} all have colour ${colour(members[0])}: ${ids(members)}`),
      ...group(nodes, (node) => `${node.type}, shape ${node.style?.shape ?? "-"}, ${colour(node)}`).map(([name, members]) => `${members.length} of ${nodes.length} nodes are ${name}`),
      ...group(nodes.filter((node) => iconName(node.icon)), (node) => iconName(node.icon)!).filter(([, members]) => members.length >= REPEATED_ICON_MIN)
        .map(([name, members]) => `Icon ${name} is on ${members.length} nodes: ${members.map((node) => `${node.id} ${JSON.stringify(short(node.text, 24))}`).join(", ")}`),
      `${nodes.filter((node) => !iconName(node.icon)).length} of ${nodes.length} nodes have no icon`,
    ],
  };
}
