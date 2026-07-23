/**
 * Style-topic contract.
 *
 * One topic, one file, one export: `style` carries the craft prose that the
 * styleGuideContext loader concatenates into the session's <style_guide>
 * block. Style topics are guidance only — they have no check() and never
 * produce diagnostics; the always-on lint registry owns that surface.
 * Voice: craft guidance, defaults-not-laws, 6–15 lines of prose.
 */
export interface StyleTopic {
  /** Stable kebab-case id, e.g. "spacing-and-corridors". */
  id: string;
  /** Human heading used for the topic's section in the style guide. */
  title: string;
  /**
   * The craft prose: a plain multi-line string. Each topic file authors it
   * as a flush-left template literal in a PROSE constant — edit it like
   * text (lines, sub-bullets, blank lines), not like code.
   */
  prose: string;
}
