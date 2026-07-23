/**
 * The shared board vocabulary: the four derived questions the raw schema
 * doesn't answer by name — what kind is this object (`kindOf`), which
 * section is the page frame (`pageFrameOf`), whose children are these
 * (`childrenOf`), and who counts as a layout sibling (`siblingsOf` —
 * stickies and annotation-markers deliberately excluded).
 *
 * The digest and all lint rules read the board through these, so they
 * can never disagree about frame/containment/sibling semantics. Helpers
 * return the REAL schema objects — never copies or reshapes.
 */
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

export type CanvasObjectKind = "section" | "sticky" | "annotationish" | "node";

export function kindOf(object: InteractiveCanvasObject): CanvasObjectKind {
  if (object.type === "section") return "section";
  if (object.type === "sticky") return "sticky";
  if (object.type === "annotation-marker") return "annotationish";
  return "node";
}

export function pageFrameOf(document: InteractiveCanvasDocument): InteractiveCanvasObject | null {
  const lockedFrames = document.objects.filter(
    (object) => kindOf(object) === "section" && object.locked === "background",
  );
  return lockedFrames.find((object) => (object.parentId ?? null) === null)
    ?? lockedFrames[0]
    ?? null;
}

export function childrenOf(document: InteractiveCanvasDocument, id: string): InteractiveCanvasObject[] {
  return document.objects.filter((object) => object.parentId === id);
}

export function siblingsOf(document: InteractiveCanvasDocument, id: string): InteractiveCanvasObject[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const self = byId.get(id);
  if (!self) return [];
  return document.objects.filter((object) =>
    object.id !== id
    && (object.parentId ?? null) === (self.parentId ?? null)
    && kindOf(object) !== "sticky"
    && kindOf(object) !== "annotationish");
}
