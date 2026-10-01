/**
 * Draft-only page-frame injection: every frameless board gets a base root
 * section at session start, so the agent always has a page to size and to
 * place into. The frame lives only in the draft — a session never writes it
 * back (toolkit `draftForDisk`), and its title is the board's own title.
 *
 * Pure document → document, so both the session layer (which builds drafts)
 * and the lints (whose authorship baseline is the draft a session STARTS
 * from, frame included) read it from here.
 */
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  CANVAS_GRID_SIZE,
  GEOMETRY_NORMALIZATION_GRID,
  boundsForGeometries,
} from "../../../canvas/src/state/geometry";
import { nextId } from "../../../canvas/src/state/actions/helpers";

const PAGE_FRAME_ID = "page-frame";
const PAGE_FRAME_INSET = 32;
const DEFAULT_PAGE_SIZE = { width: 1200, height: 720 } as const;

export function injectedPageFrame(
  document: InteractiveCanvasDocument,
): InteractiveCanvasObject | null {
  if (document.objects.some((object) => (
    object.type === "section"
    && object.parentId == null
  ))) return null;

  let geometry: CanvasGeometry;
  if (document.size) {
    geometry = {
      x: PAGE_FRAME_INSET,
      y: PAGE_FRAME_INSET,
      width: Math.max(CANVAS_GRID_SIZE, document.size.width - PAGE_FRAME_INSET * 2),
      height: Math.max(CANVAS_GRID_SIZE, document.size.height - PAGE_FRAME_INSET * 2),
    };
  } else {
    const bounds = boundsForGeometries(
      document.objects.map((object) => object.geometry),
      PAGE_FRAME_INSET,
    );
    if (bounds) {
      // The injected frame is geometry the agent then reasons about and
      // writes against, so it normalizes on the write grid (4), not the UI's
      // interaction grid (16). Outward rounding still fully contains bounds.
      const grid = GEOMETRY_NORMALIZATION_GRID;
      const x = Math.floor(bounds.x / grid) * grid;
      const y = Math.floor(bounds.y / grid) * grid;
      const right = Math.ceil((bounds.x + bounds.width) / grid) * grid;
      const bottom = Math.ceil((bounds.y + bounds.height) / grid) * grid;
      geometry = { x, y, width: right - x, height: bottom - y };
    } else {
      geometry = {
        x: PAGE_FRAME_INSET,
        y: PAGE_FRAME_INSET,
        width: DEFAULT_PAGE_SIZE.width - PAGE_FRAME_INSET * 2,
        height: DEFAULT_PAGE_SIZE.height - PAGE_FRAME_INSET * 2,
      };
    }
  }

  const ids = document.objects.map((object) => object.id);
  return {
    id: ids.includes(PAGE_FRAME_ID) ? nextId(PAGE_FRAME_ID, ids) : PAGE_FRAME_ID,
    type: "section",
    text: document.title || "Canvas",
    color: "white",
    parentId: null,
    geometry,
    style: { shape: "section" },
  };
}

export function draftWithPageFrame(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  const frame = injectedPageFrame(document);
  return frame ? { ...document, objects: [frame, ...document.objects] } : document;
}
