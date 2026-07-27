/**
 * Spawn-time perception: the images the agent boots with, plus the
 * <board_state> text they ride alongside.
 *
 * Recomputed for every run (initial spawn and refinements alike, exactly like
 * the board-state snapshot), so a re-spawned context always sees the CURRENT
 * draft, never a stale render. A failed render degrades gracefully to
 * text-only: the image is skipped, the spawn proceeds, and the board_state
 * text notes the missing board render.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
// Relative import so the harness never loads the package's React surface.
import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg";

import { CANVASES_DIR } from "../kernel";
import { rasterizeSvgToPng } from "../render";
import { vocabularyContactSheet } from "./contact-sheet";
import { boardStateSnapshot } from "./context";
import type { LayoutSession } from "./store";
import { BOARD_VIEW_WIDTH, renderBoardView } from "./views";

const EXEMPLAR_CANVAS_ID = "gc-decomp-harness";
/** Raster width of the house-style exemplar image. */
const EXEMPLAR_VIEW_WIDTH = 1400;

/**
 * Base64 PNG payloads carried through sessionData to the context sidecar's
 * image hook. A missing key means that image was unavailable at spawn.
 */
export interface BootImages {
  /** The current full-board view. */
  board?: string;
  /** The house-style exemplar board. */
  exemplar?: string;
  /** The object-vocabulary contact sheet. */
  contactSheet?: string;
}

export interface BootPerception {
  /** The <board_state> text, annotated when the board render failed. */
  boardState: string;
  images: BootImages;
}

/** undefined = not yet attempted; null = missing/unrenderable; Buffer = cached. */
let exemplarCache: Buffer | null | undefined;

/**
 * The house-style exemplar image: the exemplar canvas rendered to a PNG,
 * cached for the life of the process (the exemplar is static disk content).
 * Returns null — never throws — when the canvas is missing or unrenderable.
 */
export function houseStyleExemplar(): Buffer | null {
  if (exemplarCache !== undefined) return exemplarCache;
  const path = join(CANVASES_DIR, `${EXEMPLAR_CANVAS_ID}.canvas.json`);
  if (!existsSync(path)) {
    exemplarCache = null;
    return null;
  }
  try {
    const document = JSON.parse(readFileSync(path, "utf8")) as InteractiveCanvasDocument;
    const pageFrame = document.objects.find(
      (object) => object.type === "section" && (object.parentId ?? null) === null,
    );
    const rendered = renderDocumentToSvg(document, {
      ...(pageFrame ? { sectionId: pageFrame.id } : {}),
      fit: "content",
      padding: 16,
      width: EXEMPLAR_VIEW_WIDTH,
    });
    exemplarCache = rasterizeSvgToPng(rendered.svg).png;
  } catch {
    exemplarCache = null;
  }
  return exemplarCache;
}

/**
 * Assemble the spawn payload: the board-state text plus the boot images —
 * board render first, exemplar second, vocabulary contact sheet third. Render
 * failures never fail the spawn.
 */
export function bootPerception(session: LayoutSession): BootPerception {
  const images: BootImages = {};
  let boardState = boardStateSnapshot(session);
  try {
    const rendered = renderBoardView(session.draft, { width: BOARD_VIEW_WIDTH });
    images.board = rasterizeSvgToPng(rendered.svg).png.toString("base64");
  } catch (error) {
    boardState += "\n\n(board render unavailable at spawn — "
      + `${error instanceof Error ? error.message : String(error)}; `
      + "call look for a fresh full-board render)";
  }
  const exemplar = houseStyleExemplar();
  if (exemplar) images.exemplar = exemplar.toString("base64");
  const sheet = vocabularyContactSheet();
  if (sheet) images.contactSheet = sheet.toString("base64");
  return { boardState, images };
}
