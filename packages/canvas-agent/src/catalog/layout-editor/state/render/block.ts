/**
 * The two primitives every block in this folder is built from.
 */

export function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** One nesting level inside <state>: tags sit at one, bodies at two. */
const TAG_INDENT = "    ";
const BODY_INDENT = TAG_INDENT + TAG_INDENT;

/**
 * One tagged section of the state block, indented one level under <state>
 * (tags) and two (bodies), so the block reads as the tree it is. Body lines
 * get a constant prefix, never re-wrapped or re-leveled: indentation inside
 * the board digest is load-bearing (indent = containment), and a uniform
 * shift preserves it exactly. Blank lines stay blank. An empty body collapses
 * to a self-closing tag.
 */
export function block(tag: string, attrs: string, body: string): string[] {
  const open = attrs.length > 0 ? `<${tag} ${attrs}>` : `<${tag}>`;
  if (body.length === 0) return [`${TAG_INDENT}${open.slice(0, -1)} />`];
  const indented = body
    .split("\n")
    .map((line) => (line.length > 0 ? `${BODY_INDENT}${line}` : line));
  return [`${TAG_INDENT}${open}`, ...indented, `${TAG_INDENT}</${tag}>`];
}
