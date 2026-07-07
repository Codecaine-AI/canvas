/**
 * ui/icons — the single icon source for the whole repo.
 *
 * - `nucleo/` (generated): one chrome icon component per file, from the
 *   licensed Nucleo library via manifest.json + the Nucleo icon codegen tool.
 *   Re-exports `IconProps` for convenience.
 * - `custom-icons`: the few hand-authored icons that can't be generated
 *   (dynamic-color swatch).
 * - `icon-glyphs`: the canvas-object glyph registry (`icon` object type),
 *   built from the generated glyph data.
 */

export type { IconProps } from "./icon-props";
export * from "./nucleo";
export * from "./custom-icons";
export * from "./icon-glyphs";
