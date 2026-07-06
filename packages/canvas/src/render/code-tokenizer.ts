"use client";

import { CODE_BLOCK } from "../tokens/figjam-tokens";

/**
 * Minimal, pure "good enough to match the reference PNG" code tokenizer for
 * the `code-block` object type (W2). This is intentionally NOT a real
 * syntax-highlighting engine (no grammar, no AST, no language server) — it's
 * a handful of regexes tuned for the two languages the reference boards
 * actually show: a python-ish class-definition snippet and small JSON
 * fragments. Anything else falls back to plain (untokenized) text in
 * CODE_BLOCK.syntax.fg.
 */

export type CodeToken = {
  text: string;
  color: string;
};

/** Languages the tokenizer has dedicated rules for; anything else is untouched plain text. */
export type CodeTokenizerLanguage = "python" | "json" | (string & {});

const PYTHON_KEYWORDS = new Set([
  "class",
  "def",
  "return",
  "self",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "in",
  "not",
  "and",
  "or",
  "import",
  "from",
  "as",
  "pass",
  "None",
  "True",
  "False",
  "raise",
  "try",
  "except",
  "finally",
  "with",
  "lambda",
  "yield",
  "async",
  "await",
]);

/** True-ish "types" — capitalized identifiers read as class/type names in the reference PNG (e.g. class bases, annotations). */
const CAPITALIZED_WORD = /^[A-Z][A-Za-z0-9_]*$/;

function tokenizePythonLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  // Order matters: strings first (so keywords inside strings aren't
  // relit), then comments, then word-boundary keyword/identifier matching.
  const pattern =
    /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z0-9_"'#]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const [, comment, string, word, other] = match;
    if (comment !== undefined) {
      tokens.push({ text: comment, color: CODE_BLOCK.syntax.comment });
    } else if (string !== undefined) {
      tokens.push({ text: string, color: CODE_BLOCK.syntax.string });
    } else if (word !== undefined) {
      if (PYTHON_KEYWORDS.has(word)) {
        tokens.push({ text: word, color: CODE_BLOCK.syntax.keyword });
      } else if (CAPITALIZED_WORD.test(word)) {
        tokens.push({ text: word, color: CODE_BLOCK.syntax.type });
      } else {
        tokens.push({ text: word, color: CODE_BLOCK.syntax.fg });
      }
    } else if (other !== undefined) {
      tokens.push({ text: other, color: CODE_BLOCK.syntax.fg });
    }
  }
  return tokens;
}

/** Splits non-JSON-string text into keyword (true/false/null) vs. plain-fg tokens. */
function tokenizeJsonPlainSpan(span: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const pattern = /\b(?:true|false|null)\b|[^]+?(?=\b(?:true|false|null)\b|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(span))) {
    const text = match[0];
    if (text === "") break; // safety net against a zero-width match stalling the loop
    const isKeyword = text === "true" || text === "false" || text === "null";
    tokens.push({ text, color: isKeyword ? CODE_BLOCK.syntax.keyword : CODE_BLOCK.syntax.fg });
  }
  return tokens;
}

function tokenizeJsonLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  // First pass: split the line into quoted-string spans and the plain spans
  // between them. JSON keys (a quoted string immediately followed by a
  // colon, ignoring whitespace) render as "type" color to match the
  // reference PNG's field-name highlighting; other strings (values) render
  // as string color.
  const stringPattern = /"(?:[^"\\]|\\.)*"/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = stringPattern.exec(line))) {
    const plain = line.slice(lastEnd, match.index);
    if (plain) tokens.push(...tokenizeJsonPlainSpan(plain));

    const rest = line.slice(match.index + match[0].length);
    const isKey = /^\s*:/.test(rest);
    tokens.push({ text: match[0], color: isKey ? CODE_BLOCK.syntax.type : CODE_BLOCK.syntax.string });

    lastEnd = match.index + match[0].length;
  }
  const trailing = line.slice(lastEnd);
  if (trailing) tokens.push(...tokenizeJsonPlainSpan(trailing));
  return tokens;
}

/**
 * Tokenizes a single line of code for the given language. Returns an array
 * of `{text, color}` segments that, concatenated in order, reproduce the
 * original line exactly (this invariant is what the tests check — the
 * tokenizer must never drop or reorder characters).
 */
export function tokenizeCodeLine(line: string, language: CodeTokenizerLanguage | undefined): CodeToken[] {
  if (line === "") return [{ text: "", color: CODE_BLOCK.syntax.fg }];
  if (language === "python") return tokenizePythonLine(line);
  if (language === "json") return tokenizeJsonLine(line);
  return [{ text: line, color: CODE_BLOCK.syntax.fg }];
}

/** Tokenizes an entire code-block body (one token array per line, split on \n). */
export function tokenizeCodeBlock(
  body: string,
  language: CodeTokenizerLanguage | undefined,
): CodeToken[][] {
  return body.split("\n").map((line) => tokenizeCodeLine(line, language));
}
