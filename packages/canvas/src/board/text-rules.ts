/**
 * The name + detail text convention, as the numbers every agent-facing
 * surface quotes: the tool parameter descriptions, the Inspector's detail
 * hint, and the authoring guidance. No lint judges wording.
 *
 * A shape, icon, or section carries a NAME (`text`) — what the thing is, in a
 * few words — and optionally ONE short fact (`detail`): a port, path,
 * version, model, or host, rendered muted on one line under the name (inline
 * after a section's title). Anything longer is prose, and prose goes on a
 * sticky placed beside its subject. Stickies and edge labels are outside the
 * convention: a sticky's body is markdown, and an edge's label is a chip.
 */

/** The size the guidance asks a name to be. */
export const NAME_TARGET_WORDS = 5;

/** A name with more words than this reads as prose. */
export const NAME_MAX_WORDS = 6;

/** A name with more characters than this reads as prose. */
export const NAME_MAX_CHARS = 40;

/** A detail with more characters than this is more than one fact. */
export const DETAIL_MAX_CHARS = 48;

/**
 * A sticky note with more words than this is a wall of prose:
 * the rules it states belong on the board as wires, branches and nodes.
 */
export const NOTE_MAX_WORDS = 40;
