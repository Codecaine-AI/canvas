/**
 * Compact format of test/accuracy/chromium-truth.json, written by
 * scripts/truth-chromium.ts and read by test/accuracy.test.ts.
 *
 * One row per corpus string (corpus order) and font:
 *   "<natural> <counts> <edges>"
 *   natural  DOM single-line width (white-space: nowrap), in 1/64 px when it
 *            is a whole number of 64ths (Chromium's LayoutUnit), else "px.decimals"
 *   counts   DOM line count at each grid width, one base-36 digit each
 *   edges    DOM line count at natural + delta for each delta, base-36 digits
 * Rows of one font are joined with ";".
 */

export interface TruthFont {
  size: number;
  weight: number;
  letterSpacing: number;
  lineHeight: number;
  rows: string;
}

export interface TruthGrid {
  name: string;
  /** FontSpec.family the rows were rendered with. */
  family: string;
  widths: number[];
  fonts: TruthFont[];
}

export interface TruthFile {
  version: 1;
  generatedAt: string;
  env: Record<string, unknown>;
  corpus: { file: string; sha256: string; count: number };
  deltas: number[];
  grids: TruthGrid[];
}

export interface TruthRow {
  natural: number;
  counts: number[];
  edges: number[];
}

function digit(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 35) throw new Error(`line count ${n} does not fit one base-36 digit`);
  return n.toString(36);
}

export function encodeRow(row: TruthRow): string {
  const n64 = row.natural * 64;
  const natural = Math.abs(n64 - Math.round(n64)) < 1e-6 ? String(Math.round(n64)) : row.natural.toFixed(6);
  return `${natural} ${row.counts.map(digit).join("")} ${row.edges.map(digit).join("")}`;
}

export function decodeRows(rows: string): TruthRow[] {
  return rows.split(";").map((row) => {
    const [natural, counts, edges] = row.split(" ") as [string, string, string];
    return {
      natural: natural.includes(".") ? Number(natural) : Number(natural) / 64,
      counts: [...counts].map((c) => parseInt(c, 36)),
      edges: [...edges].map((c) => parseInt(c, 36)),
    };
  });
}

/** Box widths of the edge sweep: natural + delta, at least 1px (as the page laid them out). */
export function edgeWidths(natural: number, deltas: readonly number[]): number[] {
  return deltas.map((d) => Math.max(1, natural + d));
}
