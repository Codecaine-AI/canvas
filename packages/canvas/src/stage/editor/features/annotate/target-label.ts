import { objectTypeDefaults } from "../../../../state/schema/object-defaults";
import type { InteractiveCanvasObject } from "../../../../state/schema";

/** Plain-language label for the object an agent note is pinned to. */
export function annotationTargetLabel(object: InteractiveCanvasObject): string {
  const text = object.text.trim();
  if (object.type === "section") {
    return text ? `Section "${text}"` : objectTypeDefaults(object.type).label;
  }
  return text || objectTypeDefaults(object.type).label;
}
