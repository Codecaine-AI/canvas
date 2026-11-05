/**
 * board-too-large — the whole board, with its view padding, must fit within
 * BOARD_MAX_EDGE_PX on its long edge (error tier, finishing pass).
 *
 * A board is judged whole, as one image of its full extent: the camera
 * `renderBoardView` frames (painted extents, view padding, title chips),
 * measured here at 1:1 world scale. Up to the cap the image is the board at
 * real size. Past it the image scales down, and every name, detail and wire
 * label prints smaller. The cure is layout, not type: rows of sections that
 * grow down instead of one long row, closer sections, less empty space.
 *
 * The rule ignores the session baseline on purpose: a board reopened past the
 * cap (a drawer's second canvas_open, or `climb render` opening a finished
 * board) is still too large for the judge view.
 */
import { boardCameraAtWorldScale } from "../../../render/views";
import { DEFAULT_CANVAS_STYLE } from "../../../theme/canvas-style";
import { pageFrameOf } from "../../helpers";

import type { InteractiveCanvasDocument } from "../../../state/schema";
import type { CanvasStyle } from "../../../theme/canvas-style";
import type { LayoutRule } from "../types";

/**
 * The longest board edge, in px, that a judge reads at real size. 2576px is
 * the largest image edge Opus reads without scaling the image down, and
 * `climb render` (packages/eval-suite/runner/src/climb/render.ts,
 * JUDGE_PNG_MAX_EDGE) renders the judged board at 1:1 up to this edge.
 */
export const BOARD_MAX_EDGE_PX = 2576;

/** The board's whole extent at 1:1 world scale, as the judged render frames it. */
function boardExtent(document: InteractiveCanvasDocument, style: CanvasStyle) {
  const camera = boardCameraAtWorldScale(document, style);
  return { camera, edge: Math.max(camera.width, camera.height) };
}

const GUIDANCE = `A board is read whole, as one image of its full extent with its padding:
- this finishing-pass error fires when that extent's long edge is over ${BOARD_MAX_EDGE_PX}px;
  past it the image scales down and every label prints smaller than drawn;
- fix the layout, not the text: move sections closer, stack a long row of sections into 2 rows,
  or cut empty space, then fit_section each section and the page frame;
- never shrink a node or cut label text to fit.`;

export const rule: LayoutRule = {
  id: "board-too-large",
  title: "Board too large to read at real size",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    if (document.objects.length === 0) return [];
    const style = context?.canvasStyle ?? DEFAULT_CANVAS_STYLE;
    const now = boardExtent(document, style);
    if (now.edge <= BOARD_MAX_EDGE_PX) return [];

    const { camera } = now;
    const width = Math.round(camera.width);
    const height = Math.round(camera.height);
    const scale = BOARD_MAX_EDGE_PX / now.edge;
    const over = Math.ceil(now.edge - BOARD_MAX_EDGE_PX);
    const wide = camera.width >= camera.height;
    const frame = pageFrameOf(document);
    return [{
      rule: "board-too-large",
      severity: "error",
      at: frame ? [frame.id] : [],
      where: camera,
      message:
        `board is ${width}×${height}px with its padding; the cap is ${BOARD_MAX_EDGE_PX}px on the long edge, `
        + `so the judge view shrinks it to ${scale.toFixed(2)}× and its text prints smaller than drawn`,
      suggestion:
        `cut ${over}px from the ${wide ? "width" : "height"}: move sections closer, `
        + `stack a long ${wide ? "row" : "column"} of sections into 2 ${wide ? "rows" : "columns"}, or cut empty space; `
        + "never shrink nodes or cut label text",
    }];
  },
};
