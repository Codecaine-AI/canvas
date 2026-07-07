/**
 * ui/icons — INTERFACE icons only (co-location alignment: the canvas-object
 * glyph registry for the `icon` object type is canvas CONTENT, not interface
 * chrome, and lives with its def at objects/shapes/icon/icon-glyphs.ts).
 *
 * - `nucleo/` (generated): one chrome icon component per file, from the
 *   licensed Nucleo library via manifest.json + the Nucleo icon codegen tool
 *   (tools/nucleo-icons/generate.ts, which also emits the canvas glyph data
 *   into objects/shapes/icon/). Re-exports `IconProps` for convenience.
 * - `custom-icons`: the few hand-authored icons that can't be generated
 *   (dynamic-color swatch).
 */

export type { IconProps } from "./icon-props";
export * from "./nucleo";
export * from "./custom-icons";
