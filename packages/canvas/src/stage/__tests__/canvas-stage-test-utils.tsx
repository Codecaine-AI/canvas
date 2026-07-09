import type { ReactNode } from "react";
import {
  InteractionFeedbackScreen,
  InteractionFeedbackWorld,
} from "../editor/pipeline/InteractionFeedback";
import type { InteractionOverlay } from "../editor/pipeline/state";
import { CanvasStage, type CanvasStageProps } from "../CanvasStage";

type CanvasStageWithInteractionProps = Omit<
  CanvasStageProps,
  "dropTargetId" | "connectorDragActive"
> & {
  interactionOverlay?: InteractionOverlay;
  hoveredObjectId?: string | null;
  interactionEnabled?: boolean;
  overlay?: ReactNode;
  worldOverlay?: ReactNode;
};

export function CanvasStageWithInteraction({
  document,
  viewport,
  selectedObjectIds,
  interactionOverlay,
  hoveredObjectId = null,
  interactionEnabled,
  activeTool,
  compact,
  overlay,
  worldOverlay,
  ...stageProps
}: CanvasStageWithInteractionProps) {
  const resolvedInteractionEnabled =
    interactionEnabled ?? Boolean(stageProps.onStagePointerEvent);

  return (
    <CanvasStage
      {...stageProps}
      document={document}
      viewport={viewport}
      selectedObjectIds={selectedObjectIds}
      dropTargetId={interactionOverlay?.dropTargetId}
      connectorDragActive={Boolean(interactionOverlay?.connectorDrag)}
      activeTool={activeTool}
      compact={compact}
      overlay={
        <>
          <InteractionFeedbackScreen
            document={document}
            viewport={viewport}
            selectedObjectIds={selectedObjectIds}
            interactionOverlay={interactionOverlay}
            hoveredObjectId={hoveredObjectId}
            activeTool={activeTool}
            interactionEnabled={resolvedInteractionEnabled}
          />
          {overlay}
        </>
      }
      worldOverlay={
        <InteractionFeedbackWorld
          document={document}
          viewport={viewport}
          interactionOverlay={interactionOverlay}
          activeTool={activeTool}
          compact={compact}
        >
          {worldOverlay}
        </InteractionFeedbackWorld>
      }
    />
  );
}
