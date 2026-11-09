/**
 * The name text convention, as the numbers every agent-facing surface quotes:
 * the tool parameter descriptions and the authoring guidance. No lint judges
 * wording.
 *
 * A shape, icon, or section shows a NAME (`text`) only — what the thing is, in
 * a few words. Extra context is prose, and prose goes on a sticky placed
 * beside its subject. Stickies and edge labels are outside the convention: a
 * sticky's body is markdown, and an edge's label is a chip.
 */

/** The size the guidance asks a name to be. */
export const NAME_TARGET_WORDS = 5;

/** A name with more words than this reads as prose. */
export const NAME_MAX_WORDS = 6;

/** A name with more characters than this reads as prose. */
export const NAME_MAX_CHARS = 40;

/**
 * A sticky note with more words than this is a wall of prose:
 * the rules it states belong on the board as wires, branches and nodes.
 */
export const NOTE_MAX_WORDS = 40;
