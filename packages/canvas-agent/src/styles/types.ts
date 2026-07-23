/**
 * Style-topic contract (v5 Tier B — v5-plan.md §1).
 *
 * One topic, one file, one export: `style` carries the craft prose that the
 * styleGuideContext loader concatenates into the session's <style_guide>
 * block. Style topics are guidance only — they have no check() and never
 * produce diagnostics; the always-on lint surface lives in src/lints/.
 * Voice: craft guidance, defaults-not-laws, 6–15 lines of prose.
 */
export interface StyleTopic {
  /** Stable kebab-case id, e.g. "spacing-and-corridors". */
  id: string;
  /** Human heading used for the topic's section in the style guide. */
  title: string;
  /** The craft prose. Multi-line; newline-joined. */
  prose: string;
}
