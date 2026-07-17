import type {
  Compass,
  FanDeclaration,
  FanDirection,
  GridItem,
  PlacedItem,
  SizeClass,
  Sketch,
  SketchEdge,
  SketchNode,
  TierAxis,
  TierDeclaration,
} from "./types";

const INDENT = "  ";
const COMPASS_VALUES = new Set<Compass>([
  "N", "NE", "E", "SE", "S", "SW", "W", "NW", "C",
]);
const SIZE_VALUES = new Set<SizeClass>(["S", "M", "L"]);
const FAN_DIRECTIONS = new Set<FanDirection>(["N", "S", "E", "W"]);
const TIER_AXES = new Set<TierAxis>(["x", "y"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function quoted(value: string): string {
  return JSON.stringify(value);
}

function idToken(id: string): string {
  return SAFE_ID.test(id) ? id : quoted(id);
}

function serializeWeight(weight: number): string {
  if (!Number.isFinite(weight)) {
    throw new Error(`Sketch split weights must be finite; received ${String(weight)}.`);
  }
  return Object.is(weight, -0) ? "-0" : String(weight);
}

interface SerializeState {
  nextOrdinal: number;
  firstOrdinalById: Map<string, number>;
}

function declareId(id: string, state: SerializeState): number {
  const ordinal = state.nextOrdinal;
  state.nextOrdinal += 1;
  if (!state.firstOrdinalById.has(id)) state.firstOrdinalById.set(id, ordinal);
  return ordinal;
}

function serializeItemBody(
  item: PlacedItem | GridItem,
  state: SerializeState,
): string {
  const ordinal = declareId(item.id, state);
  return `${ordinal}=${idToken(item.id)}#${item.type}(${item.size})`;
}

function serializeNode(
  node: SketchNode,
  depth: number,
  lines: string[],
  state: SerializeState,
): void {
  const prefix = INDENT.repeat(depth);
  if (node.kind === "split") {
    const weights = node.weights.map((weight, index) => {
      const hug = node.hugs?.[index];
      return `${serializeWeight(weight)}${hug ? `@${hug}` : ""}`;
    });
    lines.push(
      `${prefix}${node.axis === "column" ? "col" : "row"} ${weights.join("|")}`,
    );
    for (const child of node.children) serializeNode(child, depth + 1, lines, state);
    return;
  }
  if (node.kind === "grid") {
    const items = node.items.map((item) => serializeItemBody(item, state));
    const spacing = node.gap === 0 ? "flush" : `g${node.gap}`;
    lines.push(
      `${prefix}grid ${node.rows}x${node.columns} ${spacing}:${items.length > 0 ? ` ${items.join(" ")}` : ""}`,
    );
    return;
  }
  if (node.kind === "section") {
    const hasLabel = Object.prototype.hasOwnProperty.call(node, "label");
    const label = !hasLabel
      ? ""
      : ` label ${node.label === undefined ? "undefined" : quoted(node.label)}`;
    const ordinal = declareId(node.id, state);
    lines.push(`${prefix}sec ${ordinal}=${idToken(node.id)}${label}`);
    serializeNode(node.child, depth + 1, lines, state);
    return;
  }
  const items = node.items.map((item) => `${item.at} ${serializeItemBody(item, state)}`);
  lines.push(`${prefix}leaf:${items.length > 0 ? ` ${items.join(" ")}` : ""}`);
}

/** Serialize a sketch to a compact, coordinate-free, indented DSL. */
export function serializeSketch(sketch: Sketch): string {
  const lines: string[] = [];
  const state: SerializeState = { nextOrdinal: 1, firstOrdinalById: new Map() };
  serializeNode(sketch.root, 0, lines, state);
  const operand = (id: string): string => (
    String(state.firstOrdinalById.get(id) ?? quoted(id))
  );
  for (const tier of sketch.tiers) {
    lines.push(
      `tier ${idToken(tier.name)} ${tier.axis}: ${tier.members.map(operand).join(" ")}`,
    );
  }
  for (const fan of sketch.fans) {
    lines.push(
      `fan ${operand(fan.hub)} > (${fan.children.map(operand).join(" ")}) ${fan.dir}`,
    );
  }
  const edges = sketch.edges.map((edge) => (
    `${operand(edge.from)}>${operand(edge.to)}`
  ));
  lines.push(`edges:${edges.length > 0 ? ` ${edges.join(" ")}` : ""}`);
  return lines.join("\n");
}

interface SourceLine {
  indent: number;
  content: string;
  lineNumber: number;
}

interface Cursor {
  source: string;
  offset: number;
  lineNumber: number;
}

interface ParseState {
  idsByOrdinal: Map<number, string>;
}

function syntaxError(lineNumber: number, message: string): Error {
  return new Error(`Invalid sketch DSL on line ${lineNumber}: ${message}`);
}

function skipSpaces(cursor: Cursor): void {
  while (cursor.source[cursor.offset] === " ") cursor.offset += 1;
}

function readJsonToken(cursor: Cursor, opening: '"' | "["): unknown {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== opening) {
    throw syntaxError(cursor.lineNumber, `expected a JSON ${opening === '"' ? "string" : "array"}.`);
  }
  const start = cursor.offset;
  let inString = opening === '"';
  let escaped = false;
  let bracketDepth = opening === "[" ? 1 : 0;
  cursor.offset += 1;

  while (cursor.offset < cursor.source.length) {
    const character = cursor.source[cursor.offset];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') {
        inString = false;
        cursor.offset += 1;
        if (opening === '"') break;
        continue;
      }
    } else if (character === '"') inString = true;
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") {
      bracketDepth -= 1;
      cursor.offset += 1;
      if (bracketDepth === 0) break;
      continue;
    }
    cursor.offset += 1;
  }

  if (inString || (opening === "[" && bracketDepth !== 0)) {
    throw syntaxError(cursor.lineNumber, `unterminated JSON ${opening === '"' ? "string" : "array"}.`);
  }
  try {
    return JSON.parse(cursor.source.slice(start, cursor.offset));
  } catch {
    throw syntaxError(cursor.lineNumber, "malformed JSON token.");
  }
}

function readJsonString(cursor: Cursor): string {
  const value = readJsonToken(cursor, '"');
  if (typeof value !== "string") throw syntaxError(cursor.lineNumber, "expected a string.");
  return value;
}

function assertEnd(cursor: Cursor): void {
  skipSpaces(cursor);
  if (cursor.offset !== cursor.source.length) {
    throw syntaxError(cursor.lineNumber, `unexpected text ${quoted(cursor.source.slice(cursor.offset))}.`);
  }
}

function readOrdinal(cursor: Cursor): number {
  skipSpaces(cursor);
  const start = cursor.offset;
  while (/\d/.test(cursor.source[cursor.offset] ?? "")) cursor.offset += 1;
  const token = cursor.source.slice(start, cursor.offset);
  const ordinal = Number(token);
  if (!/^[1-9]\d*$/.test(token) || !Number.isSafeInteger(ordinal)) {
    throw syntaxError(cursor.lineNumber, "expected a positive integer object ordinal.");
  }
  return ordinal;
}

function readIdentifier(cursor: Cursor, delimiter: string): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] === '"') return readJsonString(cursor);
  const start = cursor.offset;
  while (
    cursor.offset < cursor.source.length
    && cursor.source[cursor.offset] !== delimiter
  ) cursor.offset += 1;
  const id = cursor.source.slice(start, cursor.offset);
  if (!SAFE_ID.test(id)) {
    throw syntaxError(cursor.lineNumber, `unsafe id ${quoted(id)} must be JSON-quoted.`);
  }
  return id;
}

function registerOrdinal(
  state: ParseState,
  ordinal: number,
  id: string,
  lineNumber: number,
): void {
  if (state.idsByOrdinal.has(ordinal)) {
    throw syntaxError(lineNumber, `object ordinal ${ordinal} is declared more than once.`);
  }
  state.idsByOrdinal.set(ordinal, id);
}

function readItemBody(cursor: Cursor, state: ParseState): GridItem {
  const ordinal = readOrdinal(cursor);
  if (cursor.source[cursor.offset] !== "=") {
    throw syntaxError(cursor.lineNumber, "expected `=` after object ordinal.");
  }
  cursor.offset += 1;
  const id = readIdentifier(cursor, "#");
  if (cursor.source[cursor.offset] !== "#") {
    throw syntaxError(cursor.lineNumber, "expected `#` between item id and type.");
  }
  cursor.offset += 1;
  const typeStart = cursor.offset;
  while (
    cursor.offset < cursor.source.length
    && cursor.source[cursor.offset] !== "("
  ) cursor.offset += 1;
  const type = cursor.source.slice(typeStart, cursor.offset);
  if (!SAFE_ID.test(type) || cursor.source[cursor.offset] !== "(") {
    throw syntaxError(cursor.lineNumber, "expected a canvas type followed by a size class.");
  }
  cursor.offset += 1;
  const sizeStart = cursor.offset;
  while (
    cursor.offset < cursor.source.length
    && cursor.source[cursor.offset] !== ")"
  ) cursor.offset += 1;
  const size = cursor.source.slice(sizeStart, cursor.offset) as SizeClass;
  if (!SIZE_VALUES.has(size)) {
    throw syntaxError(cursor.lineNumber, `unknown size class ${quoted(size)}.`);
  }
  if (cursor.source[cursor.offset] !== ")") {
    throw syntaxError(cursor.lineNumber, "unterminated item size class.");
  }
  cursor.offset += 1;
  registerOrdinal(state, ordinal, id, cursor.lineNumber);
  return { id, type: type as GridItem["type"], size };
}

function parseLeaf(line: SourceLine, state: ParseState): PlacedItem[] {
  const cursor: Cursor = {
    source: line.content.slice("leaf:".length), offset: 0, lineNumber: line.lineNumber,
  };
  const items: PlacedItem[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) return items;
    const compassStart = cursor.offset;
    while (cursor.offset < cursor.source.length && cursor.source[cursor.offset] !== " ") {
      cursor.offset += 1;
    }
    const at = cursor.source.slice(compassStart, cursor.offset) as Compass;
    if (!COMPASS_VALUES.has(at)) {
      throw syntaxError(line.lineNumber, `unknown compass position ${quoted(at)}.`);
    }
    const body = readItemBody(cursor, state);
    items.push({ id: body.id, type: body.type, size: body.size, at });
  }
}

function parseGrid(line: SourceLine, state: ParseState): SketchNode {
  const cursor: Cursor = {
    source: line.content.slice("grid".length), offset: 0, lineNumber: line.lineNumber,
  };
  const rows = readOrdinal(cursor);
  if (cursor.source[cursor.offset] !== "x") {
    throw syntaxError(line.lineNumber, "expected `x` between grid rows and columns.");
  }
  cursor.offset += 1;
  const columns = readOrdinal(cursor);
  skipSpaces(cursor);
  let gap: number;
  if (cursor.source.startsWith("flush", cursor.offset)) {
    gap = 0;
    cursor.offset += "flush".length;
  } else if (cursor.source[cursor.offset] === "g") {
    cursor.offset += 1;
    gap = readOrdinal(cursor);
    if (![32, 64, 96].includes(gap)) {
      throw syntaxError(line.lineNumber, `grid gap ${gap} is not on the spacing ladder.`);
    }
  } else {
    throw syntaxError(line.lineNumber, "expected `flush` or a ladder gap (g32/g64/g96).");
  }
  if (cursor.source[cursor.offset] !== ":") {
    throw syntaxError(line.lineNumber, "expected `:` after the grid header.");
  }
  cursor.offset += 1;
  const items: GridItem[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) break;
    items.push(readItemBody(cursor, state));
  }
  if (items.length > rows * columns || items.length <= (rows - 1) * columns) {
    throw syntaxError(
      line.lineNumber,
      `a ${rows}x${columns} grid cannot hold ${items.length} cell(s).`,
    );
  }
  return { kind: "grid", rows, columns, gap, items };
}

interface SectionHeader {
  ordinal: number;
  id: string;
  hasLabel: boolean;
  label?: string;
}

function parseSectionHeader(line: SourceLine): SectionHeader {
  const cursor: Cursor = {
    source: line.content.slice("sec".length), offset: 0, lineNumber: line.lineNumber,
  };
  const ordinal = readOrdinal(cursor);
  if (cursor.source[cursor.offset] !== "=") {
    throw syntaxError(line.lineNumber, "expected `=` after section ordinal.");
  }
  cursor.offset += 1;
  const id = readIdentifier(cursor, " ");
  skipSpaces(cursor);
  if (cursor.offset === cursor.source.length) return { ordinal, id, hasLabel: false };
  if (!cursor.source.startsWith("label", cursor.offset)) {
    throw syntaxError(line.lineNumber, "expected the optional `label` keyword.");
  }
  cursor.offset += "label".length;
  if (cursor.source[cursor.offset] !== " ") {
    throw syntaxError(line.lineNumber, "expected a space after `label`.");
  }
  skipSpaces(cursor);
  if (cursor.source.slice(cursor.offset) === "undefined") {
    return { ordinal, id, hasLabel: true, label: undefined };
  }
  const label = readJsonString(cursor);
  assertEnd(cursor);
  return { ordinal, id, hasLabel: true, label };
}

interface ParsedWeights {
  weights: number[];
  hugs: (Compass | null)[] | null;
}

function parseWeights(line: SourceLine, keyword: "row" | "col"): ParsedWeights {
  const source = line.content.slice(keyword.length).trim();
  if (source === "") return { weights: [], hugs: null };
  const weights: number[] = [];
  const hugs: (Compass | null)[] = [];
  for (const token of source.split("|")) {
    if (token.trim() === "") {
      throw syntaxError(line.lineNumber, "split weights cannot contain an empty value.");
    }
    const [weightToken, hugToken, ...extra] = token.split("@");
    if (extra.length > 0) {
      throw syntaxError(line.lineNumber, `invalid split weight ${quoted(token)}.`);
    }
    const weight = Number(weightToken);
    if (!Number.isFinite(weight)) {
      throw syntaxError(line.lineNumber, `invalid split weight ${quoted(token)}.`);
    }
    if (hugToken !== undefined && !COMPASS_VALUES.has(hugToken as Compass)) {
      throw syntaxError(line.lineNumber, `unknown hug corner ${quoted(hugToken)}.`);
    }
    weights.push(weight);
    hugs.push(hugToken === undefined ? null : hugToken as Compass);
  }
  return {
    weights,
    hugs: hugs.some((hug) => hug !== null) ? hugs : null,
  };
}

function parseNode(
  lines: SourceLine[], start: number, expectedIndent: number, state: ParseState,
): { node: SketchNode; next: number } {
  const line = lines[start];
  if (!line) throw new Error("Invalid sketch DSL: missing root node.");
  if (line.indent !== expectedIndent) {
    throw syntaxError(line.lineNumber, `expected ${expectedIndent} spaces of indentation.`);
  }
  if (line.content.startsWith("leaf:")) {
    return { node: { kind: "leaf", items: parseLeaf(line, state) }, next: start + 1 };
  }
  if (line.content.startsWith("grid ")) {
    return { node: parseGrid(line, state), next: start + 1 };
  }
  if (line.content.startsWith("sec ")) {
    const section = parseSectionHeader(line);
    registerOrdinal(state, section.ordinal, section.id, line.lineNumber);
    const childLine = lines[start + 1];
    if (!childLine || childLine.indent !== expectedIndent + INDENT.length) {
      throw syntaxError(line.lineNumber, "a section must have exactly one indented child.");
    }
    const parsedChild = parseNode(lines, start + 1, expectedIndent + INDENT.length, state);
    const following = lines[parsedChild.next];
    if (following && following.indent > expectedIndent) {
      throw syntaxError(following.lineNumber, "a section cannot have more than one child.");
    }
    const node: SketchNode = {
      kind: "section",
      id: section.id,
      ...(section.hasLabel ? { label: section.label } : {}),
      child: parsedChild.node,
    };
    return { node, next: parsedChild.next };
  }
  const keyword = line.content === "row" || line.content.startsWith("row ")
    ? "row"
    : line.content === "col" || line.content.startsWith("col ") ? "col" : null;
  if (!keyword) throw syntaxError(line.lineNumber, "expected `row`, `col`, `sec`, or `leaf:`.");

  const children: SketchNode[] = [];
  let next = start + 1;
  while (next < lines.length && lines[next].indent > expectedIndent) {
    if (lines[next].indent !== expectedIndent + INDENT.length) {
      throw syntaxError(lines[next].lineNumber, "unexpected indentation below split.");
    }
    const parsedChild = parseNode(lines, next, expectedIndent + INDENT.length, state);
    children.push(parsedChild.node);
    next = parsedChild.next;
  }
  const parsedWeights = parseWeights(line, keyword);
  return {
    node: {
      kind: "split",
      axis: keyword === "row" ? "row" : "column",
      weights: parsedWeights.weights,
      ...(parsedWeights.hugs ? { hugs: parsedWeights.hugs } : {}),
      children,
    },
    next,
  };
}

function sourceLines(source: string): { tree: SourceLine[]; edgeBlock: SourceLine } {
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const markerIndex = rawLines.findIndex(
    (line) => line === "edges:" || line.startsWith("edges: "),
  );
  if (markerIndex < 0) throw new Error("Invalid sketch DSL: missing `edges:` block.");
  const convert = (line: string, index: number): SourceLine | null => {
    if (line.trim() === "") return null;
    const leading = line.length - line.trimStart().length;
    if (/\t/.test(line.slice(0, leading))) {
      throw syntaxError(index + 1, "tabs are not valid indentation.");
    }
    return { indent: leading, content: line.slice(leading), lineNumber: index + 1 };
  };
  const tree = rawLines.slice(0, markerIndex)
    .map(convert).filter((line): line is SourceLine => line !== null);
  const trailing = rawLines.slice(markerIndex + 1)
    .map((line, index) => convert(line, markerIndex + 1 + index))
    .filter((line): line is SourceLine => line !== null);
  if (trailing.length > 0) {
    throw syntaxError(trailing[0].lineNumber, "unexpected content after the `edges:` block.");
  }
  return {
    tree,
    edgeBlock: { indent: 0, content: rawLines[markerIndex], lineNumber: markerIndex + 1 },
  };
}

function readEdgeOperand(cursor: Cursor, state: ParseState): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] === '"') return readJsonString(cursor);
  const ordinal = readOrdinal(cursor);
  const id = state.idsByOrdinal.get(ordinal);
  if (id === undefined) {
    throw syntaxError(cursor.lineNumber, `edge refers to undeclared ordinal ${ordinal}.`);
  }
  return id;
}

function parseTier(line: SourceLine, state: ParseState): TierDeclaration {
  const cursor: Cursor = {
    source: line.content.slice("tier".length), offset: 0, lineNumber: line.lineNumber,
  };
  skipSpaces(cursor);
  const name = readIdentifier(cursor, " ");
  skipSpaces(cursor);
  const axis = cursor.source[cursor.offset] as TierAxis;
  if (!TIER_AXES.has(axis)) {
    throw syntaxError(line.lineNumber, `unknown tier axis ${quoted(String(axis))}.`);
  }
  cursor.offset += 1;
  if (cursor.source[cursor.offset] !== ":") {
    throw syntaxError(line.lineNumber, "expected `:` after the tier axis.");
  }
  cursor.offset += 1;
  const members: string[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) break;
    members.push(readEdgeOperand(cursor, state));
  }
  if (members.length < 2) {
    throw syntaxError(line.lineNumber, "a tier needs at least two members.");
  }
  return { name, axis, members };
}

function parseFan(line: SourceLine, state: ParseState): FanDeclaration {
  const cursor: Cursor = {
    source: line.content.slice("fan".length), offset: 0, lineNumber: line.lineNumber,
  };
  const hub = readEdgeOperand(cursor, state);
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== ">") {
    throw syntaxError(line.lineNumber, "expected `>` after the fan hub.");
  }
  cursor.offset += 1;
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== "(") {
    throw syntaxError(line.lineNumber, "expected `(` before the fan children.");
  }
  cursor.offset += 1;
  const children: string[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) {
      throw syntaxError(line.lineNumber, "unterminated fan child list.");
    }
    if (cursor.source[cursor.offset] === ")") {
      cursor.offset += 1;
      break;
    }
    children.push(readEdgeOperand(cursor, state));
  }
  if (children.length < 2) {
    throw syntaxError(line.lineNumber, "a fan needs at least two children.");
  }
  skipSpaces(cursor);
  const dir = cursor.source[cursor.offset] as FanDirection;
  if (!FAN_DIRECTIONS.has(dir)) {
    throw syntaxError(line.lineNumber, `unknown fan direction ${quoted(String(dir))}.`);
  }
  cursor.offset += 1;
  assertEnd(cursor);
  return { hub, children, dir };
}

function parseEdges(line: SourceLine, state: ParseState): SketchEdge[] {
  const cursor: Cursor = {
    source: line.content.slice("edges:".length),
    offset: 0,
    lineNumber: line.lineNumber,
  };
  const edges: SketchEdge[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset === cursor.source.length) return edges;
    const from = readEdgeOperand(cursor, state);
    if (cursor.source[cursor.offset] !== ">") {
      throw syntaxError(line.lineNumber, "expected `>` between edge endpoints.");
    }
    cursor.offset += 1;
    const to = readEdgeOperand(cursor, state);
    if (
      cursor.offset < cursor.source.length
      && cursor.source[cursor.offset] !== " "
    ) {
      throw syntaxError(line.lineNumber, "expected a space between edges.");
    }
    edges.push({ from, to });
  }
}

/** Parse the coordinate-free DSL emitted by {@link serializeSketch}. */
export function parseSketch(source: string): Sketch {
  const lines = sourceLines(source);
  if (lines.tree.length === 0) throw new Error("Invalid sketch DSL: missing root node.");
  const state: ParseState = { idsByOrdinal: new Map() };
  const parsed = parseNode(lines.tree, 0, 0, state);
  let next = parsed.next;
  const tiers: TierDeclaration[] = [];
  while (next < lines.tree.length && lines.tree[next]!.content.startsWith("tier ")) {
    const line = lines.tree[next]!;
    if (line.indent !== 0) throw syntaxError(line.lineNumber, "tier declarations must not be indented.");
    tiers.push(parseTier(line, state));
    next += 1;
  }
  const fans: FanDeclaration[] = [];
  while (next < lines.tree.length && lines.tree[next]!.content.startsWith("fan ")) {
    const line = lines.tree[next]!;
    if (line.indent !== 0) throw syntaxError(line.lineNumber, "fan declarations must not be indented.");
    fans.push(parseFan(line, state));
    next += 1;
  }
  if (next !== lines.tree.length) {
    throw syntaxError(
      lines.tree[next]!.lineNumber,
      "expected tier or fan declarations, or the `edges:` block.",
    );
  }
  return { root: parsed.node, tiers, fans, edges: parseEdges(lines.edgeBlock, state) };
}
