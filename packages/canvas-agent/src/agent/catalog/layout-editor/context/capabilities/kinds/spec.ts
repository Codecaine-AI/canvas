/**
 * The shape of one entity-kind's documentation in the <capabilities> context
 * block. Every kind teaches, in order: what it is (description), what the
 * board can do with it (functionality — named topics with points and
 * subpoints), and how to use it well (tips). The assembly in ../index.ts
 * renders each kind as a nested XML block around the kind's operation
 * fragment and any generated schema roster.
 *
 * Behavioral truth for every claim lives in service/session/op-surface.ts
 * and service/session/apply-ops.ts — verify there before writing here.
 */

/** One bullet, optionally with nested sub-bullets. */
export interface SpecPoint {
  point: string;
  subpoints?: readonly string[];
}

/** A bullet-list item: a plain line or a point with subpoints. */
export type SpecItem = string | SpecPoint;

/** A named functionality topic, rendered as its own nested XML block. */
export interface SpecTopic {
  /** snake_case XML tag for the topic, e.g. "title_and_color". */
  topic: string;
  items: readonly SpecItem[];
}

export interface KindSpec {
  /** What the kind IS — one sentence, rendered as the <description> block. */
  description: string;
  /**
   * What the board can do with the kind, grouped into named topics and
   * rendered as nested XML blocks inside <functionality>.
   */
  functionality: readonly SpecTopic[];
  /** How to use the kind well, rendered as the <tips> block last. */
  tips: readonly SpecItem[];
}
