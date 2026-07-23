import type { InteractiveCanvasDocument } from "../state/schema";

/**
 * Options for the static document → SVG renderer (render/static-svg.ts).
 *
 * The same renderer serves three consumers: dashboard thumbnails (small,
 * board background), the server preview endpoint (whole doc or one section
 * via `sectionId`), and file export (natural size, SVG downloaded as-is or
 * rasterized to PNG client-side). The output must therefore be fully
 * self-contained: inline presentation attributes only — no CSS classes, no
 * external fonts, no <foreignObject>.
 */
export interface RenderStaticSvgOptions {
  /**
   * Crop to one section (and its transitive members) instead of the whole
   * document — same semantics as stage/viewport.ts containerViewBounds.
   * Unknown id falls back to whole-document bounds.
   */
  sectionId?: string;
  /**
   * Crop to an arbitrary world-space rect (agent draft renders, scope crops).
   * The viewBox becomes the rect expanded by `padding` on all sides
   * (padding defaults to 0 here — the rect is authoritative); everything is
   * still rendered and the viewBox does the clipping, so objects straddling
   * the rect edge appear partially, exactly like the live stage camera.
   * Mutually exclusive with `sectionId` — if both are given, `cropRect`
   * wins and `sectionId`/`fit` are ignored.
   */
  cropRect?: { x: number; y: number; width: number; height: number };
  /**
   * How a `sectionId` crop frames its content. "frame" (default) crops to
   * the section frame's own rect and draws the frame backdrop + title chip.
   * "content" fits the crop to the member objects' bounds and omits the
   * section frame entirely — just the diagram, for embeds that supply their
   * own framing. Empty sections fall back to "frame". No effect without
   * `sectionId`.
   */
  fit?: "frame" | "content";
  /**
   * Target output size in px. Give one dimension and the other derives from
   * the content aspect ratio; give neither and the natural world size at
   * zoom 1 is used. Giving both letterboxes (contain-fit) the content.
   */
  width?: number;
  height?: number;
  /** World-space padding around the content bounds. */
  padding?: number;
  /** "board" paints the light board surface color; "transparent" omits it. */
  background?: "board" | "transparent";
}

export interface RenderedSvg {
  /** Complete standalone <svg> markup (with xmlns), safe to serve or download. */
  svg: string;
  /** Output pixel dimensions declared on the root <svg>. */
  width: number;
  height: number;
}

export type RenderDocumentToSvg = (
  document: InteractiveCanvasDocument,
  options?: RenderStaticSvgOptions,
) => RenderedSvg;
