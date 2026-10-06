import type { AgentRect } from "@codecaine-ai/canvas-agent/protocol";

/*
 * Change marks over the board are board marks, like the canvas package's stage
 * marks (decision 56): they take the colors of the design-system theme that
 * matches the BOARD (boardMarkTheme), not the app theme, because the board
 * keeps its preset when the app turns dark (decision 10). The agent's own marks
 * (its work frame, moved and new objects) take the AI layer's violet; objects
 * it pushes aside are blue (categorical); removals are the diff's removed red.
 * Each badge color pairs with the glyph color that reads on it.
 */
export type MarkColors = {
  agent: string;
  /** Glyph on an agent badge. annotation.accent has no on-solid of its own (token gap): text.on-solid. */
  agentOn: string;
  displaced: string;
  removed: string;
  removedOn: string;
  /** The board's own surface: the veil over a moved object's old place. */
  surface: string;
};

export type DraftPreview = {
  rect: AgentRect;
  svg: string;
};
