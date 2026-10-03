/**
 * Canvas content fonts — the one source for the live stage (CSS) and the
 * static SVG renderer (SVG presentation attributes). Pure constants; no imports.
 *
 * Both families are the faces @codecaine-ai/text-measure bundles and measures
 * with (canvas/packages/text-measure/fonts: woff2 for browsers through its
 * fonts.css, TTF for its HarfBuzz backend and the agent camera's resvg), so
 * what the canvas measures (theme/text-measure.ts) is what every surface paints:
 * - Sans (Inter 3.19, OFL-1.1) at weights 400/500/600/700: object names,
 *   sticky bodies, figjam labels and section titles.
 * - Mono (IBM Plex Mono 2.5, OFL-1.1) at weights 400/500/600: metadata —
 *   detail lines, schematic section headers, connector labels — and sticky
 *   inline code (STICKY_MARKDOWN_MONO_FONT, at 400).
 * The first family of each stack is the one measured; the fallbacks only
 * paint characters the bundled face lacks (text-measure reports those as
 * uncovered).
 */

/** Canvas content font (Inter), CSS form. */
export const CANVAS_SANS_FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Canvas metadata font (IBM Plex Mono), CSS form. */
export const CANVAS_MONO_FONT_STACK =
  '"IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/*
 * SVG-attribute forms: quotes dropped (multi-word family names are valid
 * unquoted CSS idents), which keeps `font-family="…"` free of escaped quote
 * noise. Browsers and resvg resolve both forms to the same faces.
 */
export const CANVAS_SANS_FONT_STACK_SVG = CANVAS_SANS_FONT_STACK.replace(/"/g, "");
export const CANVAS_MONO_FONT_STACK_SVG = CANVAS_MONO_FONT_STACK.replace(/"/g, "");
