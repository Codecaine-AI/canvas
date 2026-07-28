/**
 * Style-topic contract.
 *
 * One topic, one file, one export: `style` carries the craft prose that the
 * `style-guide` loader concatenates into the session's <style_guide>
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

/**
 * The dimensions a finished board sits at: node size, the gaps between things,
 * how much room the page gives them, and how much a section holds.
 *
 * Targets, not floors. The lint registry owns the clearances below which a board
 * is broken; every field here sits strictly above the floor on its matching axis.
 */
export interface CraftTargets {
  /** Flow-node width. */
  nodeWidth: number;
  /** Flow-node height. */
  nodeHeight: number;
  /** The narrowest a flow node goes, whatever its content. */
  nodeMinWidth: number;
  /** Horizontal gap between nodes standing side by side across a row. */
  nodeGapRow: number;
  /** Vertical gap between nodes stacked down a column. */
  nodeGapColumn: number;
  /** Clear channel a routed wire and its label need to pass between siblings. */
  arrowCorridor: number;
  /** Gutter between sections placed side by side. */
  sectionGutterSideBySide: number;
  /** Gutter between stacked rows of sections. */
  sectionGutterStacked: number;
  /** Padding inside a frame before its first child. */
  framePadding: number;
  /** Base-section area as a multiple of the summed node area. */
  boardAreaMultiple: number;
  /** The ink share that area multiple reads as on a finished board. */
  inkShare: number;
  /** Fewest nodes a section is worth making. */
  nodesPerSectionMin: number;
  /** Most nodes a section holds before it splits into two named ones. */
  nodesPerSectionMax: number;
}
