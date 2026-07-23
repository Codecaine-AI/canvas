"use client";

import type { InteractiveCanvasDocument } from "../../../../state/schema";
import type { ViewportState } from "../../../viewport";
import { HoverHighlight } from "../selection/HoverHighlight";
import { SelectionBox } from "../selection/SelectionBox";

export interface AnnotateFeedbackProps {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  hoveredObjectId: string | null;
  selectedObjectIds: string[];
}

/** Existing editor hover and selection visuals, made inert for annotation targeting. */
export function AnnotateFeedback({
  document,
  viewport,
  hoveredObjectId,
  selectedObjectIds,
}: AnnotateFeedbackProps) {
  return (
    <>
      <SelectionBox
        document={document}
        viewport={viewport}
        selectedObjectIds={selectedObjectIds}
        interactiveHandles={false}
      />
      <HoverHighlight
        document={document}
        viewport={viewport}
        objectId={hoveredObjectId}
      />
    </>
  );
}
