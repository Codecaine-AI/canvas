/**
 * The board's description block.
 *
 * This module used to register a `board-state` context loader that rendered
 * the spawn-time snapshot at `sessionData.boardState` into a <board_state>
 * block. That loader retired with the state layer: the board is working
 * picture, so it is re-derived into section ③ on every request by the
 * layout-editor's state/ sidecar, and the spawn snapshot it seeds from is the same
 * sessionData value. What remains here is the description formatter, which
 * both the spawn snapshot (service/session/context.ts) and the state render
 * share.
 */
export function formatBoardDescription(description?: string): string {
  if (description === undefined || description.trim() === "") {
    return "DESCRIPTION · none — this board has no description yet";
  }
  return [
    "DESCRIPTION · what this board represents, its pieces, and how it reads",
    "---",
    description,
    "---",
  ].join("\n");
}
