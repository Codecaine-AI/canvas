/**
 * The name + detail text convention, as the numbers and checks every
 * agent-facing surface quotes: the tool parameter descriptions, the two text
 * lints (label-is-prose, detail-too-long), and the authoring guidance.
 *
 * A shape, icon, or section carries a NAME (`text`) — what the thing is, in a
 * few words — and optionally ONE short fact (`detail`): a port, path,
 * version, model, or host, rendered muted on one line under the name (inline
 * after a section's title). Anything longer is prose, and prose goes on a
 * sticky placed beside its subject. Stickies and edge labels are outside the
 * convention: a sticky's body is markdown, and an edge's label has its own
 * readability lint.
 *
 * Pure string logic, no document access: the lints decide which objects to
 * ask about, this module decides what the answer is.
 */

/** The size the guidance asks a name to be. The lint tolerates one more word. */
export const NAME_TARGET_WORDS = 5;

/** A name with more words than this reads as prose (label-is-prose). */
export const NAME_MAX_WORDS = 6;

/** A name with more characters than this reads as prose (label-is-prose). */
export const NAME_MAX_CHARS = 40;

/** A detail with more characters than this is more than one fact (detail-too-long). */
export const DETAIL_MAX_CHARS = 48;

/**
 * Where one sentence ends and the next begins: terminal punctuation
 * (optionally closed by a quote or bracket), whitespace, then a capital.
 * Requiring the capital keeps abbreviations ("e.g. ports", "approx. 5 ms")
 * and dotted names ("Node.js", "v1.2") from reading as two sentences.
 */
const SENTENCE_BREAK = /[.!?…]["'”’)\]]*\s+["'“‘(\[]?\p{Lu}/gu;

/** A word is a whitespace-separated run with a letter or digit in it — a "·" separator is not one. */
const WORD = /[\p{L}\p{N}]/u;

/** Whitespace collapsed to single spaces and trimmed — how a one-line slot reads the text. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The number of words in `text`. */
export function wordCount(text: string): number {
  return oneLine(text).split(" ").filter((token) => WORD.test(token)).length;
}

/** The number of sentences in `text`: one, plus one per sentence break. Empty text has none. */
export function sentenceCount(text: string): number {
  const line = oneLine(text);
  if (line === "") return 0;
  return 1 + (line.match(SENTENCE_BREAK)?.length ?? 0);
}

/** Whether `text` breaks onto a second line (ignoring leading and trailing whitespace). */
export function hasLineBreak(text: string): boolean {
  return /[\r\n]/.test(text.trim());
}

/**
 * Why a name reads as prose, as short measured phrases ("9 words",
 * "57 chars", "2 sentences", "a line break") — empty when it is a name.
 * A name is one line of at most NAME_MAX_WORDS words and NAME_MAX_CHARS
 * characters, with no sentence break.
 */
export function nameProseReasons(text: string): string[] {
  const line = oneLine(text);
  if (line === "") return [];
  const reasons: string[] = [];
  const words = wordCount(line);
  if (words > NAME_MAX_WORDS) reasons.push(`${words} words`);
  if (line.length > NAME_MAX_CHARS) reasons.push(`${line.length} chars`);
  const sentences = sentenceCount(line);
  if (sentences > 1) reasons.push(`${sentences} sentences`);
  if (hasLineBreak(text)) reasons.push("a line break");
  return reasons;
}

/**
 * Why a detail is more than one short fact, as measured phrases ("63 chars",
 * "2 sentences", "a line break") — empty when it is one. A detail is one line
 * of at most DETAIL_MAX_CHARS characters holding a single sentence at most.
 */
export function detailProblems(detail: string): string[] {
  const line = oneLine(detail);
  if (line === "") return [];
  const problems: string[] = [];
  if (line.length > DETAIL_MAX_CHARS) problems.push(`${line.length} chars`);
  const sentences = sentenceCount(line);
  if (sentences > 1) problems.push(`${sentences} sentences`);
  if (hasLineBreak(detail)) problems.push("a line break");
  return problems;
}
