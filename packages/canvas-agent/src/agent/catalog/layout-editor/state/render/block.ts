/**
 * The two primitives every block in this folder is built from.
 */

export function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * One tagged section of the state block. Bodies are emitted flush left, never
 * re-indented: indentation inside the board digest is load-bearing (indent =
 * containment), so the bytes the digest produced are the bytes the model sees.
 * An empty body collapses to a self-closing tag.
 */
export function block(tag: string, attrs: string, body: string): string[] {
  const open = attrs.length > 0 ? `<${tag} ${attrs}>` : `<${tag}>`;
  return body.length > 0 ? [open, body, `</${tag}>`] : [`${open.slice(0, -1)} />`];
}
