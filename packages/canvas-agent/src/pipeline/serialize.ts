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
const GRID_GAPS = new Set([0, 32, 64, 96]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function quoted(value: string): string {
  return JSON.stringify(value);
}

/**
 * The serialized `text=` value for an internal id. Synthetic ids minted by the
 * parser for duplicate names carry a `#<k>` (k >= 2) suffix; stripping it
 * recovers the declared text, so duplicates re-serialize verbatim and the
 * uniquification never appears in output.
 */
function nameToken(id: string): string {
  const synthetic = /^(.*)#([1-9]\d*)$/.exec(id);
  const text = synthetic && Number(synthetic[2]) >= 2 ? synthetic[1]! : id;
  return SAFE_ID.test(text) ? text : quoted(text);
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

function hugSuffix(hug: Compass | null): string {
  return hug ? ` hug=${hug}` : "";
}

function serializeItemLine(
  item: PlacedItem | GridItem,
  at: Compass | null,
  hug: Compass | null,
  state: SerializeState,
): string {
  const ordinal = declareId(item.id, state);
  const position = at ? ` at=${at}` : "";
  return `item ${ordinal} text=${nameToken(item.id)} type=${item.type} size=${item.size}${position}${hugSuffix(hug)}`;
}

function serializeNode(
  node: SketchNode,
  depth: number,
  lines: string[],
  state: SerializeState,
  hug: Compass | null,
): void {
  const prefix = INDENT.repeat(depth);
  if (node.kind === "split") {
    const keyword = node.axis === "column" ? "col" : "row";
    const weights = node.weights.map(serializeWeight).join("|");
    lines.push(
      `${prefix}${keyword}${node.weights.length > 0 ? ` ${weights}` : ""}${hugSuffix(hug)}`,
    );
    node.children.forEach((child, index) => {
      serializeNode(child, depth + 1, lines, state, node.hugs?.[index] ?? null);
    });
    return;
  }
  if (node.kind === "grid") {
    lines.push(`${prefix}grid ${node.rows}x${node.columns} gap=${node.gap}${hugSuffix(hug)}`);
    for (const item of node.items) {
      lines.push(`${prefix}${INDENT}${serializeItemLine(item, null, null, state)}`);
    }
    return;
  }
  if (node.kind === "section") {
    const hasLabel = Object.prototype.hasOwnProperty.call(node, "label");
    const label = !hasLabel
      ? ""
      : ` label=${node.label === undefined ? "undefined" : quoted(node.label)}`;
    const ordinal = declareId(node.id, state);
    lines.push(`${prefix}section ${ordinal} text=${nameToken(node.id)}${label}${hugSuffix(hug)}`);
    serializeNode(node.child, depth + 1, lines, state, null);
    return;
  }
  if (node.items.length === 1) {
    const item = node.items[0]!;
    lines.push(`${prefix}${serializeItemLine(item, item.at, hug, state)}`);
    return;
  }
  lines.push(`${prefix}group${hugSuffix(hug)}`);
  for (const item of node.items) {
    lines.push(`${prefix}${INDENT}${serializeItemLine(item, item.at, null, state)}`);
  }
}

/** Serialize a sketch to the labeled, indentation-nested v3 layout language. */
export function serializeSketch(sketch: Sketch): string {
  const lines: string[] = [];
  const state: SerializeState = { nextOrdinal: 1, firstOrdinalById: new Map() };
  serializeNode(sketch.root, 0, lines, state, null);
  const operand = (id: string): string => (
    String(state.firstOrdinalById.get(id) ?? quoted(id))
  );
  if (sketch.tiers.length + sketch.fans.length > 0) {
    lines.push("");
    for (const tier of sketch.tiers) {
      lines.push(`align ${tier.axis}: ${tier.members.map(operand).join(" ")}`);
    }
    for (const fan of sketch.fans) {
      lines.push(`fan ${operand(fan.hub)} dir=${fan.dir}: ${fan.children.map(operand).join(" ")}`);
    }
  }
  lines.push("");
  lines.push("arrows");
  for (const edge of sketch.edges) {
    lines.push(`${INDENT}${operand(edge.from)} > ${operand(edge.to)}`);
  }
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
  usedIds: Set<string>;
}

function syntaxError(lineNumber: number, message: string): Error {
  return new Error(`Invalid sketch DSL on line ${lineNumber}: ${message}`);
}

function skipSpaces(cursor: Cursor): void {
  while (cursor.source[cursor.offset] === " ") cursor.offset += 1;
}

function readJsonString(cursor: Cursor): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== '"') {
    throw syntaxError(cursor.lineNumber, "expected a JSON string.");
  }
  const start = cursor.offset;
  let escaped = false;
  cursor.offset += 1;
  while (cursor.offset < cursor.source.length) {
    const character = cursor.source[cursor.offset];
    cursor.offset += 1;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') {
      try {
        const value: unknown = JSON.parse(cursor.source.slice(start, cursor.offset));
        if (typeof value !== "string") throw new Error("not a string");
        return value;
      } catch {
        throw syntaxError(cursor.lineNumber, "malformed JSON string.");
      }
    }
  }
  throw syntaxError(cursor.lineNumber, "unterminated JSON string.");
}

function assertEnd(cursor: Cursor): void {
  skipSpaces(cursor);
  if (cursor.offset !== cursor.source.length) {
    throw syntaxError(cursor.lineNumber, `unexpected text ${quoted(cursor.source.slice(cursor.offset))}.`);
  }
}

function readWord(cursor: Cursor): string {
  skipSpaces(cursor);
  const start = cursor.offset;
  while (
    cursor.offset < cursor.source.length
    && cursor.source[cursor.offset] !== " "
  ) cursor.offset += 1;
  return cursor.source.slice(start, cursor.offset);
}

function readOrdinal(cursor: Cursor): number {
  skipSpaces(cursor);
  const start = cursor.offset;
  while (/\d/.test(cursor.source[cursor.offset] ?? "")) cursor.offset += 1;
  const token = cursor.source.slice(start, cursor.offset);
  const ordinal = Number(token);
  if (!/^[1-9]\d*$/.test(token) || !Number.isSafeInteger(ordinal)) {
    throw syntaxError(cursor.lineNumber, "expected a positive integer object number.");
  }
  return ordinal;
}

function readIdentifier(cursor: Cursor): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] === '"') return readJsonString(cursor);
  const id = readWord(cursor);
  if (!SAFE_ID.test(id)) {
    throw syntaxError(cursor.lineNumber, `unsafe name ${quoted(id)} must be JSON-quoted.`);
  }
  return id;
}

function tryKey(cursor: Cursor, key: string): boolean {
  skipSpaces(cursor);
  if (!cursor.source.startsWith(`${key}=`, cursor.offset)) return false;
  cursor.offset += key.length + 1;
  return true;
}

function expectKey(cursor: Cursor, key: string): void {
  if (!tryKey(cursor, key)) {
    throw syntaxError(cursor.lineNumber, `expected \`${key}=\`.`);
  }
}

function readCompass(cursor: Cursor, field: string): Compass {
  const value = readWord(cursor) as Compass;
  if (!COMPASS_VALUES.has(value)) {
    throw syntaxError(cursor.lineNumber, `unknown \`${field}=\` compass ${quoted(value)}.`);
  }
  return value;
}

function readOptionalHug(cursor: Cursor, hugAllowed: boolean): Compass | null {
  if (!tryKey(cursor, "hug")) return null;
  if (!hugAllowed) {
    throw syntaxError(cursor.lineNumber, "`hug=` is only valid on a direct child of a split.");
  }
  return readCompass(cursor, "hug");
}

/**
 * Duplicate `text=` values are legal — references go through numbers — but the
 * engine needs unique internal ids. The first declaration keeps its text
 * verbatim; each later duplicate gets `<text>#<k>` with the smallest k >= 2
 * not already used as an id (`#` cannot appear in an unquoted name, so
 * synthetic ids stay out of the declared namespace; incrementing until unused
 * guarantees uniqueness regardless).
 */
function uniquifyId(state: ParseState, text: string): string {
  let id = text;
  if (state.usedIds.has(id)) {
    let k = 2;
    while (state.usedIds.has(`${text}#${k}`)) k += 1;
    id = `${text}#${k}`;
  }
  state.usedIds.add(id);
  return id;
}

function registerOrdinal(
  state: ParseState,
  ordinal: number,
  id: string,
  lineNumber: number,
): void {
  if (state.idsByOrdinal.has(ordinal)) {
    throw syntaxError(lineNumber, `object number ${ordinal} is declared more than once.`);
  }
  state.idsByOrdinal.set(ordinal, id);
}

interface ItemLineContext {
  /** "required" outside grids, "forbidden" inside them. */
  at: "required" | "forbidden";
  hugAllowed: boolean;
}

interface ParsedItemLine {
  item: PlacedItem | GridItem;
  hug: Compass | null;
}

function parseItemLine(
  line: SourceLine,
  state: ParseState,
  context: ItemLineContext,
): ParsedItemLine {
  const cursor: Cursor = {
    source: line.content.slice("item".length), offset: 0, lineNumber: line.lineNumber,
  };
  const ordinal = readOrdinal(cursor);
  expectKey(cursor, "text");
  const id = uniquifyId(state, readIdentifier(cursor));
  expectKey(cursor, "type");
  const type = readWord(cursor);
  if (!SAFE_ID.test(type)) {
    throw syntaxError(line.lineNumber, `expected a canvas type after \`type=\`; got ${quoted(type)}.`);
  }
  expectKey(cursor, "size");
  const size = readWord(cursor) as SizeClass;
  if (!SIZE_VALUES.has(size)) {
    throw syntaxError(line.lineNumber, `unknown size class ${quoted(size)}.`);
  }
  let at: Compass | null = null;
  if (context.at === "required") {
    if (!tryKey(cursor, "at")) {
      throw syntaxError(line.lineNumber, "expected `at=` (items outside a grid state their compass position).");
    }
    at = readCompass(cursor, "at");
  } else if (tryKey(cursor, "at")) {
    throw syntaxError(line.lineNumber, "`at=` is not allowed inside a grid (the lattice places items).");
  }
  const hug = readOptionalHug(cursor, context.hugAllowed);
  assertEnd(cursor);
  registerOrdinal(state, ordinal, id, line.lineNumber);
  const base: GridItem = { id, type: type as GridItem["type"], size };
  return { item: at ? { id: base.id, type: base.type, size: base.size, at } : base, hug };
}

interface SectionHeader {
  ordinal: number;
  id: string;
  hasLabel: boolean;
  label?: string;
  hug: Compass | null;
}

function parseSectionHeader(line: SourceLine, hugAllowed: boolean): SectionHeader {
  const cursor: Cursor = {
    source: line.content.slice("section".length), offset: 0, lineNumber: line.lineNumber,
  };
  const ordinal = readOrdinal(cursor);
  expectKey(cursor, "text");
  const id = readIdentifier(cursor);
  let hasLabel = false;
  let label: string | undefined;
  if (tryKey(cursor, "label")) {
    hasLabel = true;
    skipSpaces(cursor);
    const rest = cursor.source.slice(cursor.offset);
    if (rest === "undefined" || rest.startsWith("undefined ")) {
      label = undefined;
      cursor.offset += "undefined".length;
    } else if (cursor.source[cursor.offset] === '"') {
      label = readJsonString(cursor);
    } else {
      throw syntaxError(line.lineNumber, "expected a JSON string or `undefined` after `label=`.");
    }
  }
  const hug = readOptionalHug(cursor, hugAllowed);
  assertEnd(cursor);
  return { ordinal, id, hasLabel, label, hug };
}

interface GridHeader {
  rows: number;
  columns: number;
  gap: number;
  hug: Compass | null;
}

function parseGridHeader(line: SourceLine, hugAllowed: boolean): GridHeader {
  const cursor: Cursor = {
    source: line.content.slice("grid".length), offset: 0, lineNumber: line.lineNumber,
  };
  const rows = readOrdinal(cursor);
  if (cursor.source[cursor.offset] !== "x") {
    throw syntaxError(line.lineNumber, "expected `x` between grid rows and columns.");
  }
  cursor.offset += 1;
  const columns = readOrdinal(cursor);
  expectKey(cursor, "gap");
  const gapToken = readWord(cursor);
  const gap = Number(gapToken);
  if (!/^\d+$/.test(gapToken) || !GRID_GAPS.has(gap)) {
    throw syntaxError(line.lineNumber, `grid gap ${quoted(gapToken)} is not on the spacing ladder (0/32/64/96).`);
  }
  const hug = readOptionalHug(cursor, hugAllowed);
  assertEnd(cursor);
  return { rows, columns, gap, hug };
}

function parseSplitWeights(token: string, lineNumber: number): number[] {
  const weights: number[] = [];
  for (const part of token.split("|")) {
    if (part === "") {
      throw syntaxError(lineNumber, "split weights cannot contain an empty value.");
    }
    const weight = Number(part);
    if (!Number.isFinite(weight)) {
      throw syntaxError(lineNumber, `invalid split weight ${quoted(part)}.`);
    }
    weights.push(weight);
  }
  return weights;
}

interface ParsedNode {
  node: SketchNode;
  next: number;
  hug: Compass | null;
}

function parseIndentedItems(
  lines: SourceLine[],
  start: number,
  parentIndent: number,
  state: ParseState,
  context: ItemLineContext,
  container: "group" | "grid",
): { items: ParsedItemLine[]; next: number } {
  const items: ParsedItemLine[] = [];
  let next = start;
  while (next < lines.length && lines[next]!.indent > parentIndent) {
    const line = lines[next]!;
    if (line.indent !== parentIndent + INDENT.length) {
      throw syntaxError(line.lineNumber, `expected ${parentIndent + INDENT.length} spaces of indentation.`);
    }
    if (!line.content.startsWith("item ")) {
      throw syntaxError(line.lineNumber, `expected an \`item\` line inside a ${container}.`);
    }
    items.push(parseItemLine(line, state, context));
    next += 1;
  }
  return { items, next };
}

function parseNode(
  lines: SourceLine[],
  start: number,
  expectedIndent: number,
  state: ParseState,
  hugAllowed: boolean,
): ParsedNode {
  const line = lines[start];
  if (!line) throw new Error("Invalid sketch DSL: missing root node.");
  if (line.indent !== expectedIndent) {
    throw syntaxError(line.lineNumber, `expected ${expectedIndent} spaces of indentation.`);
  }

  if (line.content.startsWith("item ")) {
    const parsed = parseItemLine(line, state, { at: "required", hugAllowed });
    return {
      node: { kind: "leaf", items: [parsed.item as PlacedItem] },
      next: start + 1,
      hug: parsed.hug,
    };
  }

  if (line.content === "group" || line.content.startsWith("group ")) {
    const cursor: Cursor = {
      source: line.content.slice("group".length), offset: 0, lineNumber: line.lineNumber,
    };
    const hug = readOptionalHug(cursor, hugAllowed);
    assertEnd(cursor);
    const children = parseIndentedItems(
      lines, start + 1, expectedIndent, state,
      { at: "required", hugAllowed: false }, "group",
    );
    return {
      node: { kind: "leaf", items: children.items.map(({ item }) => item as PlacedItem) },
      next: children.next,
      hug,
    };
  }

  if (line.content.startsWith("grid ")) {
    const header = parseGridHeader(line, hugAllowed);
    const children = parseIndentedItems(
      lines, start + 1, expectedIndent, state,
      { at: "forbidden", hugAllowed: false }, "grid",
    );
    const count = children.items.length;
    if (count > header.rows * header.columns || count <= (header.rows - 1) * header.columns) {
      throw syntaxError(
        line.lineNumber,
        `a ${header.rows}x${header.columns} grid cannot hold ${count} cell(s).`,
      );
    }
    return {
      node: {
        kind: "grid",
        rows: header.rows,
        columns: header.columns,
        gap: header.gap,
        items: children.items.map(({ item }) => item),
      },
      next: children.next,
      hug: header.hug,
    };
  }

  if (line.content.startsWith("section ")) {
    const section = parseSectionHeader(line, hugAllowed);
    const sectionId = uniquifyId(state, section.id);
    registerOrdinal(state, section.ordinal, sectionId, line.lineNumber);
    const childLine = lines[start + 1];
    if (!childLine || childLine.indent !== expectedIndent + INDENT.length) {
      throw syntaxError(line.lineNumber, "a section must have exactly one indented child.");
    }
    const parsedChild = parseNode(
      lines, start + 1, expectedIndent + INDENT.length, state, false,
    );
    const following = lines[parsedChild.next];
    if (following && following.indent > expectedIndent) {
      throw syntaxError(following.lineNumber, "a section cannot have more than one child.");
    }
    const node: SketchNode = {
      kind: "section",
      id: sectionId,
      ...(section.hasLabel ? { label: section.label } : {}),
      child: parsedChild.node,
    };
    return { node, next: parsedChild.next, hug: section.hug };
  }

  const keyword = line.content === "row" || line.content.startsWith("row ")
    ? "row"
    : line.content === "col" || line.content.startsWith("col ") ? "col" : null;
  if (!keyword) {
    throw syntaxError(
      line.lineNumber,
      "expected `row`, `col`, `section`, `group`, `grid`, or `item`.",
    );
  }

  const cursor: Cursor = {
    source: line.content.slice(keyword.length), offset: 0, lineNumber: line.lineNumber,
  };
  skipSpaces(cursor);
  let weights: number[] = [];
  if (
    cursor.offset < cursor.source.length
    && !cursor.source.startsWith("hug=", cursor.offset)
  ) {
    weights = parseSplitWeights(readWord(cursor), line.lineNumber);
  }
  const hug = readOptionalHug(cursor, hugAllowed);
  assertEnd(cursor);

  const children: SketchNode[] = [];
  const childHugs: (Compass | null)[] = [];
  let next = start + 1;
  while (next < lines.length && lines[next]!.indent > expectedIndent) {
    if (lines[next]!.indent !== expectedIndent + INDENT.length) {
      throw syntaxError(lines[next]!.lineNumber, "unexpected indentation below split.");
    }
    const parsedChild = parseNode(
      lines, next, expectedIndent + INDENT.length, state, true,
    );
    children.push(parsedChild.node);
    childHugs.push(parsedChild.hug);
    next = parsedChild.next;
  }
  if (children.length !== weights.length) {
    throw syntaxError(
      line.lineNumber,
      `a ${keyword} with ${weights.length} weight(s) must have exactly one child per weight; found ${children.length}.`,
    );
  }
  const hugs = childHugs.some((childHug) => childHug !== null) ? childHugs : null;
  return {
    node: {
      kind: "split",
      axis: keyword === "row" ? "row" : "column",
      weights,
      ...(hugs ? { hugs } : {}),
      children,
    },
    next,
    hug,
  };
}

function toSourceLines(source: string): SourceLine[] {
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const lines: SourceLine[] = [];
  rawLines.forEach((raw, index) => {
    if (raw.trim() === "") return;
    const leading = raw.length - raw.trimStart().length;
    if (/\t/.test(raw.slice(0, leading))) {
      throw syntaxError(index + 1, "tabs are not valid indentation.");
    }
    lines.push({ indent: leading, content: raw.slice(leading), lineNumber: index + 1 });
  });
  return lines;
}

function readReference(cursor: Cursor, state: ParseState): string {
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] === '"') return readJsonString(cursor);
  const ordinal = readOrdinal(cursor);
  const id = state.idsByOrdinal.get(ordinal);
  if (id === undefined) {
    throw syntaxError(cursor.lineNumber, `reference to undeclared object number ${ordinal}.`);
  }
  return id;
}

function parseAlign(line: SourceLine, name: string, state: ParseState): TierDeclaration {
  const cursor: Cursor = {
    source: line.content.slice("align".length), offset: 0, lineNumber: line.lineNumber,
  };
  skipSpaces(cursor);
  const axis = cursor.source[cursor.offset] as TierAxis;
  if (!TIER_AXES.has(axis)) {
    throw syntaxError(line.lineNumber, `unknown align axis ${quoted(String(axis))}.`);
  }
  cursor.offset += 1;
  if (cursor.source[cursor.offset] !== ":") {
    throw syntaxError(line.lineNumber, "expected `:` after the align axis.");
  }
  cursor.offset += 1;
  const members: string[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) break;
    members.push(readReference(cursor, state));
  }
  if (members.length < 2) {
    throw syntaxError(line.lineNumber, "an align line needs at least two members.");
  }
  return { name, axis, members };
}

function parseFan(line: SourceLine, state: ParseState): FanDeclaration {
  const cursor: Cursor = {
    source: line.content.slice("fan".length), offset: 0, lineNumber: line.lineNumber,
  };
  const hub = readReference(cursor, state);
  if (!tryKey(cursor, "dir")) {
    throw syntaxError(line.lineNumber, "expected `dir=` after the fan hub.");
  }
  const dir = cursor.source[cursor.offset] as FanDirection;
  if (!FAN_DIRECTIONS.has(dir)) {
    throw syntaxError(line.lineNumber, `unknown fan direction ${quoted(String(dir))}.`);
  }
  cursor.offset += 1;
  if (cursor.source[cursor.offset] !== ":") {
    throw syntaxError(line.lineNumber, "expected `:` after the fan direction.");
  }
  cursor.offset += 1;
  const children: string[] = [];
  while (true) {
    skipSpaces(cursor);
    if (cursor.offset >= cursor.source.length) break;
    children.push(readReference(cursor, state));
  }
  if (children.length < 2) {
    throw syntaxError(line.lineNumber, "a fan needs at least two children.");
  }
  return { hub, children, dir };
}

function parseArrowLine(line: SourceLine, state: ParseState): SketchEdge {
  const cursor: Cursor = {
    source: line.content, offset: 0, lineNumber: line.lineNumber,
  };
  const from = readReference(cursor, state);
  skipSpaces(cursor);
  if (cursor.source[cursor.offset] !== ">") {
    throw syntaxError(line.lineNumber, "expected `>` between arrow endpoints.");
  }
  cursor.offset += 1;
  const to = readReference(cursor, state);
  assertEnd(cursor);
  return { from, to };
}

/** Parse the v3 layout language emitted by {@link serializeSketch}. */
export function parseSketch(source: string): Sketch {
  const lines = toSourceLines(source);
  if (lines.length === 0) throw new Error("Invalid sketch DSL: missing root node.");
  const state: ParseState = { idsByOrdinal: new Map(), usedIds: new Set() };
  const parsedRoot = parseNode(lines, 0, 0, state, false);
  let next = parsedRoot.next;

  const tiers: TierDeclaration[] = [];
  while (next < lines.length && (
    lines[next]!.content === "align" || lines[next]!.content.startsWith("align ")
  )) {
    const line = lines[next]!;
    if (line.indent !== 0) throw syntaxError(line.lineNumber, "align lines must not be indented.");
    tiers.push(parseAlign(line, `t${tiers.length + 1}`, state));
    next += 1;
  }

  const fans: FanDeclaration[] = [];
  while (next < lines.length && (
    lines[next]!.content === "fan" || lines[next]!.content.startsWith("fan ")
  )) {
    const line = lines[next]!;
    if (line.indent !== 0) throw syntaxError(line.lineNumber, "fan lines must not be indented.");
    fans.push(parseFan(line, state));
    next += 1;
  }

  const header = lines[next];
  if (!header) throw new Error("Invalid sketch DSL: missing `arrows` block.");
  if (header.content === "align" || header.content.startsWith("align ")) {
    throw syntaxError(header.lineNumber, "align lines must come before fan lines.");
  }
  if (header.content !== "arrows") {
    if (header.content.startsWith("arrows")) {
      throw syntaxError(header.lineNumber, "the `arrows` header takes no inline content; arrows go on indented lines.");
    }
    throw syntaxError(header.lineNumber, "expected `align`, `fan`, or the `arrows` block.");
  }
  if (header.indent !== 0) {
    throw syntaxError(header.lineNumber, "the `arrows` header must not be indented.");
  }
  next += 1;

  const edges: SketchEdge[] = [];
  while (next < lines.length) {
    const line = lines[next]!;
    if (line.indent !== INDENT.length) {
      throw syntaxError(line.lineNumber, "arrow lines must be indented 2 spaces below `arrows`.");
    }
    edges.push(parseArrowLine(line, state));
    next += 1;
  }

  return { root: parsedRoot.node, tiers, fans, edges };
}
