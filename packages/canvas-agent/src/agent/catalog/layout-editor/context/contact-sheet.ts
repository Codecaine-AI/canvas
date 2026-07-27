/**
 * Section ② reference image — the object-vocabulary contact sheet.
 *
 * The DECLARATION only: the sessionData key, the caption, and the delivery
 * slot. The sheet itself is composed and rasterized by the harness
 * (service/session/contact-sheet.ts → vocabularyContactSheet, attached in
 * service/session/boot.ts); it exists only at runtime, so what the bundle owns
 * is the statement that it is produced and attached (state-shapes.html §6).
 *
 * It pairs with context/capabilities/: the capabilities block names every type,
 * color, and glyph in words, this sheet shows what each one looks like.
 */
import type { BootImageDeclaration } from "./index";

export const contactSheet: BootImageDeclaration = {
  key: "contactSheet",
  mimeType: "image/png",
  caption:
    "the board vocabulary — every object type, icon glyph, and color rendered and labeled, plus the connection arrows and styles; the visual reference for everything the board can draw",
};

export default contactSheet;
