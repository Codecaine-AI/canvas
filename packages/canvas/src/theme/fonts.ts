/**
 * Canvas content fonts — the one source for the live stage (CSS) and the
 * static SVG renderer (SVG presentation attributes). Pure constants; no imports.
 *
 * - Sans (Inter): object names, sticky bodies, labels. Vendored from the
 *   official rsms/inter 3.19 release (OFL-1.1) at weights 400/500/600/700:
 *   static TTFs for the agent camera (packages/canvas-agent/assets/fonts —
 *   resvg does not instance the variable TTF beside them, which stays the
 *   metrics source), woff2 + @font-face for Studio (packages/studio/src/fonts,
 *   src/index.css).
 * - Mono (IBM Plex Mono): metadata — detail lines, schematic section headers,
 *   connector labels. Vendored at weights 400/500/600 from IBM's official
 *   release (github.com/IBM/plex, tag `@ibm/plex-mono@2.5.0`, font version
 *   2.005, OFL-1.1 — license text beside each copy): TTF for the agent camera
 *   (packages/canvas-agent/assets/fonts), woff2 + @font-face for Studio
 *   (packages/studio/src/fonts, src/index.css).
 *
 * Sticky inline code is NOT this mono stack: it keeps its own system-mono
 * stack (STICKY_MARKDOWN_MONO_FONT) for FigJam fidelity.
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

/**
 * IBM Plex Mono advance width in em: every spacing glyph is 600 of the font's
 * 1000 units per em, at every weight. render/text-metrics.ts
 * measureMonoTextPx measures mono runs with it.
 */
export const MONO_ADVANCE_EM = 0.6;
