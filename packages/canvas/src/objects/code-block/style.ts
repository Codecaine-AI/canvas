/**
 * Code block styling (Dracula theme) — moved from theme/tokens.ts in the
 * theme dispersal (per-kind constants co-locate with their def). Lives in
 * its own module (not def.tsx) because render/code-tokenizer.ts consumes the
 * syntax colors too, and def.tsx imports the tokenizer — a def-side home
 * would cycle.
 */

export const CODE_BLOCK = {
  bg: "#282A36",
  cornerRadiusPx: 10,
  paddingTopPx: 25,
  gutter: {
    lineNumberColor: "#999999",
    numberColumnFromLeftPx: 35,
    codeStartFromLeftPx: 66,
  },
  syntax: {
    fg: "#F8F8F2",
    keyword: "#FF79C6",
    string: "#F1FA8C",
    type: "#8BE9FD",
    /** Standard Dracula comment color. */
    comment: "#6272A4",
  },
} as const;
