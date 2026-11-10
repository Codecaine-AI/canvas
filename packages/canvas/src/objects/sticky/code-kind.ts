/**
 * What an inline `code` span on a sticky note is, so the note can color it
 * the way the docs viewer colors the same span (theme/palette.ts
 * StickyPaint.codeText).
 *
 * Copied from the docs viewer's one inline-code classifier,
 * codecaine/core/docs-system/packages/docs-viewer/src/components/typed-chip.ts
 * `chipKind`, rules and order unchanged. Keep the two in step: a span must
 * read as the same kind on a board and on the docs page around it.
 */
import type { CodeKind } from "../../theme/palette";

/** A camelCase name starting with one of these reads as a function / method. */
const VERBS =
  /^(get|set|add|remove|update|read|write|validate|project|render|create|delete|apply|resolve|parse|build|load|fetch|use|handle|make|to|is|has|find|compute|format|normalize|register|insert|move|split|merge|require|run|emit|open|close|save|select|toggle|reset|init|list|check|map|filter|reduce|serialize|commit|restore|stage|accept|reject)[A-Z0-9_]/;
/** A bare file name (no slash) still reads as a path when it ends in a known extension. */
const EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|html|py|rs|go|ya?ml|toml|sh|txt|svg|png|jpe?g|gif|webp|mp4|lock|sql|db)$/i;
const QUOTED = /^(["'`]).*\1$/;
const NUMBER = /^-?\d+(\.\d+)?(px|em|rem|ms|s|%|ch|vh|vw)?$/;
const KEYWORD_LITERAL = /^(true|false|null|undefined|NaN|Infinity)$/;
/** `name(...)`, `obj.method()`, `ns.fn(arg)`. */
const CALL_EXPRESSION = /^[\w$.-]*[A-Za-z0-9_$]\(.*\)$/;
/** `editor.setContent` style member access whose last segment is a verb-led name. */
const MEMBER_CALL = /^[a-z][\w-]*\.[a-z][A-Za-z0-9]*$/;
const CAMEL_CASE = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const PASCAL_CASE = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)*$/;
/** `kind`, `props.level`, `snake_case`, `kebab-name`. */
const KEY_PATH = /^[a-z][a-z0-9_-]*(\.[a-z][\w-]*)*$/;
/** A CSS custom property, e.g. `--docs-chip-bg`, or a family glob `--docs-kind-*`. */
const CUSTOM_PROPERTY = /^--[A-Za-z0-9][\w-]*\*?$/;

/**
 * What a span's text is: a path, a quoted string, a type, a call, a number
 * (`literal`), a keyword literal, a property, or none of those.
 */
export function codeKind(raw: string): CodeKind {
  const text = raw.trim();
  if (!text) return "other";
  if (QUOTED.test(text)) return "string";
  if (NUMBER.test(text)) return "literal";
  if (KEYWORD_LITERAL.test(text)) return "keyword";
  if (text.includes("/") || (EXT.test(text) && !/\s/.test(text))) return "path";
  if (CALL_EXPRESSION.test(text)) return "call";
  if (MEMBER_CALL.test(text) && VERBS.test(text.split(".").pop() ?? "")) return "call";
  if (CAMEL_CASE.test(text)) return VERBS.test(text) ? "call" : "prop";
  if (PASCAL_CASE.test(text)) return "type";
  if (KEY_PATH.test(text) || CUSTOM_PROPERTY.test(text)) return "prop";
  return "other";
}
