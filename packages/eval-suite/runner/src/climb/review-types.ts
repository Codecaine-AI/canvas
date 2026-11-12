/**
 * What the parts of the review loop hand each other: the reviewers
 * (critic.ts), the trial run (trial.ts) and the loop (critic-loop.ts). Ford:
 * "give very direct feedback if it's like, hey, like, this pixel thing here
 * should be moved, like, 10 pixels to the right", "be able to, like, do
 * possible, like, markings and renderings that it could send back".
 */

/** One canvas tool call a reviewer proposes, with the arguments the tool takes. */
export interface ReviewCall { tool: string; args: Record<string, unknown> }

/** The tools a section reviewer's call can name. Colour, text, shape, new wires and deletes stay text findings. */
export const SECTION_CALL_TOOLS = ["move", "resize", "change_connection", "route", "move_label"] as const;
/** The whole-board reviewer also moves and arranges sections. */
export const BOARD_CALL_TOOLS = [...SECTION_CALL_TOOLS, "arrange_section", "fit_section"] as const;

/** A reviewer's sketch, in board coordinates: a path of points, or a box. The runner draws it dashed. */
export type Mark =
  | { style: "sketch"; path: Array<[number, number]> }
  | { style: "sketch"; box: { x: number; y: number; width: number; height: number } };

/** The whole-board reviewer's unit id. A section reviewer's unit id is its section's id. */
export const BOARD_UNIT = "board";
/** The unit id of the reviewer of items in no section, or only in the page frame. */
export const LOOSE_UNIT = "loose";

/** A call, the reviewer that sent it (its unit id) and that reviewer's sketch of the result. */
export interface ProposedCall { unit: string; call: ReviewCall; marks: Mark[] }

/**
 * What the trial run tells the drawer about one finding: the lines to print
 * under it in the revise message (each call, applied or refused, its numbers
 * and flags) and the images to show with it (absolute PNG paths).
 */
export interface FindingAdvice { finding: string; lines: string[]; images: string[] }
