/**
 * Spawn-time perception: the reference images the agent boots with in section
 * ②, the eager current full-board render, and the board snapshot text that
 * seeds the agent's state.
 *
 * The split follows the state design (state-shapes.html §5): the house-style
 * exemplar and the vocabulary contact sheet are REFERENCE — they never change
 * and stay in the rebuilt context message. The board render is WORKING
 * PICTURE, so it seeds `session.currentBoard`; later gestures replace it and
 * append their own post-change renders.
 *
 * Recomputed for every run (initial spawn and refinements alike), so a
 * re-spawned agent always sees the CURRENT draft, never a stale render. A
 * failed render degrades gracefully to text-only: the image is skipped, the
 * spawn proceeds, and the board snapshot text notes the missing render.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
// Relative import so the harness never loads the package's React surface.
import { renderDocumentToSvg } from "../../../../../canvas/src/render/static-svg";

import { CANVASES_DIR } from "../../kernel";
import { rasterizeSvgToPng } from "../../render";
import { vocabularyContactSheet } from "./contact-sheet";
import { boardStateSnapshot } from "../snapshots/context";
import { captureCurrentBoard } from "./live-draft-view";
import type { LayoutSession } from "../store";

const EXEMPLAR_CANVAS_ID = "gc-decomp-harness";
/** Raster width of the house-style exemplar image. */
const EXEMPLAR_VIEW_WIDTH = 1400;

/**
 * Base64 PNG payloads carried through sessionData to the context sidecar's
 * image hook — REFERENCE images only. A missing key means that image was
 * unavailable at spawn. The board render is not here: it is working picture
 * and lives on `session.currentBoard`.
 */
export interface BootImages {
  /** The house-style exemplar board. */
  exemplar?: string;
  /** The object-vocabulary contact sheet. */
  contactSheet?: string;
}

export interface BootPerception {
  /** The board snapshot text that seeds the agent's state. */
  boardState: string;
  images: BootImages;
  /** True when the current full-board render landed on the session. */
  boardView: boolean;
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
 * Assemble the spawn payload: the board snapshot text, the reference images
 * (exemplar first, vocabulary contact sheet second), and the eager current
 * full-board render. Render failures never fail the spawn.
 */
export function bootPerception(session: LayoutSession): BootPerception {
  const images: BootImages = {};
  let boardState = boardStateSnapshot(session);
  const boardView = captureCurrentBoard(session, "session start") !== null;
  if (!boardView) {
    boardState += "\n\n(board render unavailable at spawn — "
      + `${session.currentBoardRenderFailure ?? "unknown render failure"}; `
      + "the render is retried on every state assembly)";
  }
  const exemplar = houseStyleExemplar();
  if (exemplar) images.exemplar = exemplar.toString("base64");
  const sheet = vocabularyContactSheet();
  if (sheet) images.contactSheet = sheet.toString("base64");
  return { boardState, images, boardView };
}
