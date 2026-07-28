/**
 * Section ② reference image — the house-style exemplar.
 *
 * This is the DECLARATION, not the generator: the bundle owns which
 * sessionData key carries the payload, what the model is told the picture is,
 * and where it sits in delivery order. The machinery that actually renders the
 * exemplar canvas to a PNG stays in the harness
 * (service/session/boot.ts → houseStyleExemplar), because rendering a canvas
 * document is app capability, not agent content.
 *
 * The image is REFERENCE: fixed for the life of the run, so it belongs in the
 * rebuilt context message rather than section ③ (state-shapes.html §5, §6).
 */
import type { BootImageDeclaration } from "./index";

export const exemplar: BootImageDeclaration = {
  key: "exemplar",
  mimeType: "image/png",
  caption: "a finished board in the house style — a taste reference, not this board",
};

export default exemplar;
