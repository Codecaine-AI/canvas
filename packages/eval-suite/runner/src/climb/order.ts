/**
 * The order search of the rethink turn (rethink.ts): which order of the
 * sections on a rows × columns grid costs the least wire.
 *
 * Round 5 cycle 4: board h1 raised 13 section-order findings 31 times and
 * fixed none, because each single swap broke a row or opened an empty block,
 * and nobody measured a whole other order. On board 04 a decision that fans
 * out to 4 groups sat above them. No section changed its row, its column or a
 * neighbour in either loop. So the runner measures the other orders, and the
 * rethink turn reads the best 2 with their costs. It is an estimate from cell
 * centres: the drawer tries one or keeps its own, the runner forces none.
 *
 * A cell is a section of the board frame, or a loose node there with a wire.
 * The cost of an order: the px between the centres of the 2 cells of each
 * wire, plus ORDER_COSTS.back for each wire against the reading direction,
 * plus ORDER_COSTS.far for each pair of cells with a wire that are not
 * neighbours. The board's own order is held to the same model: its cells on
 * the grid of the rows and columns they sit in. Its real centres are no fair
 * match: a drawn band is wider than the model's (r3 read 27% cheaper as a
 * column, on the bands alone).
 */
import type { WorldRect } from "./render.ts";
import type { Board, BoardObject } from "./review-inputs.ts";
import type { WireFact } from "./wires.ts";

/**
 * What a wire against the reading direction costs, and a pair of cells with
 * a wire that are not neighbours (its wires go round a cell), in px of wire.
 * Set on the first drafts of round 5 cycle 4: h1 and 04 read 15% cheaper or
 * more, r3 and r5 do not (builds/r5/gates5/order.txt).
 */
export const ORDER_COSTS = { back: 300, far: 1000 } as const;
/** The rethink turn reads the orders when the best costs this share less than the board's own, or more. */
export const ORDER_GAIN = 0.15;
/** Up to this many cells the search tries every order of every shape. Over it, a local search from the board's own order. */
export const ORDER_ALL_CELLS = 9;
/** From this many cells on, a board is no single row or column. */
const STRIP_MAX_CELLS = 3;
/** How many orders the rethink turn reads: the best of each of the cheapest shapes. */
const ORDERS_SHOWN = 2;

export interface OrderCost {
  /** `length` plus the cost of the back wires and of the pairs that are not neighbours. */
  total: number;
  /** The px between the centres of the 2 cells of each wire, summed. */
  length: number;
  /** The wires that end left of their start or above it, and neither right of it nor below. */
  back: number;
  /** The pairs of cells with a wire that are not neighbours: a cell sits between them, or they share no row and no column. */
  far: number;
}

/** An order of the cells: each row left to right, null for an empty place. */
export interface Order { rows: number; columns: number; grid: Array<Array<string | null>>; cost: OrderCost }

/** What the search found, as loop.json keeps it. */
export interface OrderSearch {
  /** The cells: the sections of the board frame, and the loose nodes there with a wire. */
  cells: string[];
  /** Whether it tried every order of every shape, or searched from the board's own order. */
  method: "every order" | "local search";
  /** The cells of the drawer's first row when the search kept them there, or null when it was free. */
  kept: string[] | null;
  /** The board's own order: its cells on the grid of the rows and columns they sit in, at the model's cost. */
  current: Order;
  /** The px between the real centres of the 2 cells of each wire on the board, summed: what `current.cost.length` models. */
  drawn: number;
  /** The cheapest order of each of the cheapest shapes, cheapest first. */
  best: Order[];
  /** Whether the rethink turn read them: the best costs ORDER_GAIN less than `current`, or more. */
  shown: boolean;
}

interface Cell { id: string; rect: WorldRect }
/** The wires from one cell to another, by index. `first`: no pair before it in the list joins the same 2 cells. */
interface Pair { from: number; to: number; wires: number; first: boolean }

/**
 * The cells of a board and the wires between them. A wire's end is the cell
 * that holds it. A wire inside one cell joins none, and neither does one
 * with an end that sits in no cell, or on a note.
 */
function cellsOf(board: Board, facts: WireFact[], pageFrame: BoardObject | null): { cells: Cell[]; pairs: Pair[] } {
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const root = pageFrame?.id ?? null;
  const top = (id: string): BoardObject | null => {
    const seen = new Set<string>();
    for (let at = byId.get(id); at && !seen.has(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) {
      if ((at.parentId ?? null) === root && at !== pageFrame) return at.geometry && at.type !== "sticky" ? at : null;
      seen.add(at.id);
    }
    return null;
  };
  const ends = facts.flatMap((fact): Array<[BoardObject, BoardObject]> => {
    const [from, to] = [top(fact.from), top(fact.to)];
    return from && to && from !== to ? [[from, to]] : [];
  });
  const wired = new Set(ends.flat());
  const cells = board.objects.filter((object) => object.geometry && object !== pageFrame && (object.parentId ?? null) === root && (object.type === "section" || wired.has(object)))
    .map((object): Cell => ({ id: object.id, rect: object.geometry }));
  const index = new Map(cells.map((cell, at) => [cell.id, at]));
  const pairs = new Map<string, Pair>();
  for (const [a, b] of ends) {
    const [from, to] = [index.get(a.id)!, index.get(b.id)!];
    const key = `${from} ${to}`;
    pairs.set(key, { from, to, wires: (pairs.get(key)?.wires ?? 0) + 1, first: pairs.get(key)?.first ?? !pairs.has(`${to} ${from}`) });
  }
  return { cells, pairs: [...pairs.values()] };
}

/** Each cell's rank along one axis: the cells whose extents overlap share a rank. */
function ranks(cells: Cell[], low: (rect: WorldRect) => number, high: (rect: WorldRect) => number): number[] {
  const rank: number[] = [];
  let [at, end] = [-1, -Infinity];
  for (const i of cells.map((_, index) => index).sort((a, b) => low(cells[a]!.rect) - low(cells[b]!.rect))) {
    const rect = cells[i]!.rect;
    if (low(rect) >= end) [at, end] = [at + 1, high(rect)];
    else end = Math.min(end, high(rect));
    rank[i] = at;
  }
  return rank;
}

/**
 * The cost of an order. `place` is the cell at each place of the grid, row by
 * row, -1 for none. The length is the least of 3 ways to lay the grid out,
 * because a board of rows of sections and one of columns are both drawn:
 * each column as wide as its widest cell and each row as high as its highest,
 * or each row packs its own cells side by side, or each column packs its own.
 * A band of `gap` sits between 2, and an empty row or column takes no room.
 */
function costOf(cells: Cell[], pairs: Pair[], place: ArrayLike<number>, rows: number, columns: number, gap: number): OrderCost {
  const [wide, high] = [new Array<number>(columns).fill(0), new Array<number>(rows).fill(0)];
  const at = new Array<number>(cells.length).fill(-1);
  for (let slot = 0; slot < rows * columns; slot += 1) {
    const cell = place[slot]!;
    if (cell < 0) continue;
    at[cell] = slot;
    const rect = cells[cell]!.rect;
    if (rect.width > wide[slot % columns]!) wide[slot % columns] = rect.width;
    if (rect.height > high[Math.floor(slot / columns)]!) high[Math.floor(slot / columns)] = rect.height;
  }
  const centres = (sizes: number[]) => { let edge = 0; return sizes.map((size) => { const centre = edge + size / 2; if (size > 0) edge += size + gap; return centre; }); };
  const [xs, ys] = [centres(wide), centres(high)];
  const [packedX, packedY] = [new Array<number>(cells.length).fill(0), new Array<number>(cells.length).fill(0)];
  for (let row = 0; row < rows; row += 1) for (let column = 0, edge = 0; column < columns; column += 1) {
    const cell = place[row * columns + column]!;
    if (cell < 0) continue;
    packedX[cell] = edge + cells[cell]!.rect.width / 2;
    edge += cells[cell]!.rect.width + gap;
  }
  for (let column = 0; column < columns; column += 1) for (let row = 0, edge = 0; row < rows; row += 1) {
    const cell = place[row * columns + column]!;
    if (cell < 0) continue;
    packedY[cell] = edge + cells[cell]!.rect.height / 2;
    edge += cells[cell]!.rect.height + gap;
  }
  const clear = (from: number, to: number, step: number) => { for (let slot = Math.min(from, to) + step; slot < Math.max(from, to); slot += step) if (place[slot]! >= 0) return false; return true; };
  let [grid, byRows, byColumns, back, far] = [0, 0, 0, 0, 0];
  for (const pair of pairs) {
    const [a, b] = [at[pair.from]!, at[pair.to]!];
    const [rowA, columnA, rowB, columnB] = [Math.floor(a / columns), a % columns, Math.floor(b / columns), b % columns];
    const [gridX, gridY] = [Math.abs(xs[columnA]! - xs[columnB]!), Math.abs(ys[rowA]! - ys[rowB]!)];
    grid += pair.wires * (gridX + gridY);
    byRows += pair.wires * (Math.abs(packedX[pair.from]! - packedX[pair.to]!) + gridY);
    byColumns += pair.wires * (gridX + Math.abs(packedY[pair.from]! - packedY[pair.to]!));
    if (rowB <= rowA && columnB <= columnA) back += pair.wires;
    if (pair.first && !(rowA === rowB ? clear(a, b, 1) : columnA === columnB && clear(a, b, columns))) far += 1;
  }
  const length = Math.round(Math.min(grid, byRows, byColumns));
  return { total: length + ORDER_COSTS.back * back + ORDER_COSTS.far * far, length, back, far };
}

const gridOf = (cells: Cell[], place: ArrayLike<number>, rows: number, columns: number): Order["grid"] =>
  Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => cells[place[row * columns + column]!]?.id ?? null));

/** The shapes a search tries: each grid with room for the cells and no row or column to spare, and no single row or column over STRIP_MAX_CELLS. With `kept` cells in the first row, the grids as wide as that row or wider. */
function shapesOf(count: number, kept: number): Array<[rows: number, columns: number]> {
  const shapes: Array<[number, number]> = [];
  if (kept) {
    for (let columns = kept; columns <= Math.max(kept, count - kept); columns += 1) {
      const rows = 1 + Math.ceil((count - kept) / columns);
      if (!shapes.some(([before]) => before === rows)) shapes.push([rows, columns]);
    }
    return shapes;
  }
  for (let rows = 1; rows <= count; rows += 1) for (let columns = 1; columns <= count; columns += 1) {
    const spare = rows * columns - count;
    if (spare >= 0 && spare < Math.min(rows, columns) && (count <= STRIP_MAX_CELLS || Math.min(rows, columns) > 1)) shapes.push([rows, columns]);
  }
  return shapes;
}

/**
 * The cheapest order of one shape. The first `fixed` places keep their
 * cells. With `all`, every order of the rest. Without, a local search from
 * `place` as it comes: the swap of 2 places that saves the most, until none
 * saves.
 */
function cheapest(cells: Cell[], pairs: Pair[], place: number[], fixed: number, rows: number, columns: number, gap: number, all: boolean): { place: number[]; cost: OrderCost } {
  let best = { place: [...place], cost: costOf(cells, pairs, place, rows, columns, gap) };
  const take = () => { const cost = costOf(cells, pairs, place, rows, columns, gap); if (cost.total < best.cost.total) best = { place: [...place], cost }; };
  const swap = (a: number, b: number) => { [place[a], place[b]] = [place[b]!, place[a]!]; };
  if (all) {
    const permute = (from: number) => {
      if (from >= place.length - 1) return take();
      let empty = false;
      for (let at = from; at < place.length; at += 1) {
        // 2 empty places are one order.
        if (place[at]! < 0) { if (empty) continue; empty = true; }
        swap(from, at);
        permute(from + 1);
        swap(from, at);
      }
    };
    permute(fixed);
    return best;
  }
  for (let from = Infinity; best.cost.total < from;) {
    from = best.cost.total;
    place.splice(0, place.length, ...best.place);
    for (let a = fixed; a < place.length; a += 1) for (let b = a + 1; b < place.length; b += 1) {
      if (place[a] === place[b]) continue;
      swap(a, b);
      take();
      swap(a, b);
    }
  }
  return best;
}

/**
 * The order search of a board: its own order and the cheapest ones the model
 * finds. Null on a board with under 3 cells or no wire between 2, and on one
 * where 2 cells overlap. `gap` is the band the model leaves between 2 cells.
 * `keepFirstRow`: the brief names a start, so the cells of the drawer's first
 * row stay there in their order.
 */
export function orderSearch(board: Board, facts: WireFact[], pageFrame: BoardObject | null, gap: number, keepFirstRow: boolean): OrderSearch | null {
  const { cells, pairs } = cellsOf(board, facts, pageFrame);
  if (cells.length < 3 || pairs.length === 0) return null;
  // The board's own rows and columns: 2 cells share a row when their heights overlap, and a column when their widths do.
  const row = ranks(cells, (rect) => rect.y, (rect) => rect.y + rect.height);
  const column = ranks(cells, (rect) => rect.x, (rect) => rect.x + rect.width);
  const [ownRows, ownColumns] = [Math.max(...row) + 1, Math.max(...column) + 1];
  const own = new Array<number>(ownRows * ownColumns).fill(-1);
  cells.forEach((_, index) => { own[row[index]! * ownColumns + column[index]!] = index; });
  if (own.filter((cell) => cell >= 0).length < cells.length) return null;
  const centre = ({ rect }: Cell) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const drawn = Math.round(pairs.reduce((sum, pair) => {
    const [from, to] = [centre(cells[pair.from]!), centre(cells[pair.to]!)];
    return sum + pair.wires * (Math.abs(from.x - to.x) + Math.abs(from.y - to.y));
  }, 0));
  // The search starts from the board's own order, row by row.
  const order = cells.map((_, index) => index).sort((a, b) => row[a]! - row[b]! || column[a]! - column[b]!);
  const first = keepFirstRow ? order.filter((index) => row[index] === 0) : [];
  const rest = order.filter((index) => !first.includes(index));
  const empty = (count: number) => new Array<number>(count).fill(-1);
  const all = cells.length <= ORDER_ALL_CELLS;
  const best = shapesOf(cells.length, first.length).map(([rows, columns]): Order => {
    const place = first.length ? [...first, ...empty(columns - first.length), ...rest, ...empty((rows - 1) * columns - rest.length)] : [...rest, ...empty(rows * columns - rest.length)];
    const found = cheapest(cells, pairs, place, first.length ? columns : 0, rows, columns, gap, all);
    return { rows, columns, grid: gridOf(cells, found.place, rows, columns), cost: found.cost };
  }).sort((a, b) => a.cost.total - b.cost.total).slice(0, ORDERS_SHOWN);
  const current: Order = { rows: ownRows, columns: ownColumns, grid: gridOf(cells, own, ownRows, ownColumns), cost: costOf(cells, pairs, own, ownRows, ownColumns, gap) };
  return {
    cells: cells.map((cell) => cell.id), method: all ? "every order" : "local search", kept: first.length ? first.map((index) => cells[index]!.id) : null,
    current, drawn, best, shown: best.length > 0 && best[0]!.cost.total <= (1 - ORDER_GAIN) * current.cost.total,
  };
}

/** Whether a brief names a start: where the flow starts, in so many words. Then the drawer's first row is the brief's, and the search keeps it. */
export const namesStart = (brief: string): boolean => /\b(starts?|begins?) (at|with|from|on|in)\b|\bentry point\b/i.test(brief);

const costLine = (cost: OrderCost) => `cost ${cost.total} (${cost.length} px of wire, ${cost.back} back, ${cost.far} not neighbours)`;
const gridLines = (order: Order) => order.grid.map((row, at) => `  row ${at + 1}: ${row.map((cell) => cell ?? "·").join(" | ")}`);
/** How much cheaper than the board's own order an order is, in percent. */
export const orderGain = (search: OrderSearch, order: Order) => Math.round(100 * (1 - order.cost.total / search.current.cost.total));

/** An order search as lines of facts: the board's own order and the best ones, each with its shape, its cost and its rows. */
export function orderLines(search: OrderSearch): string[] {
  return [
    `Now, ${search.current.rows} rows × ${search.current.columns} columns: ${costLine(search.current.cost)}`,
    ...gridLines(search.current),
    ...search.best.flatMap((order, at) => [
      `Order ${at + 1}, ${order.rows} rows × ${order.columns} columns: ${costLine(order.cost)}, ${orderGain(search, order)}% cheaper`,
      ...gridLines(order),
    ]),
  ];
}
