import type { InteractiveCanvasDocument, InteractiveCanvasEditorState } from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import type { AgentRun } from "@/_lib/useAgentRun";
import type { BoardDocument } from "@/_lib/useBoardDocument";
import { targetLabelForSelection } from "@/shared/agent";
import { AgentSidebar } from "./_components/AgentSidebar";
import { CameraLockPill } from "./_components/CameraLockPill";
import { GhostPreviewScrim } from "./_components/GhostPreviewScrim";
import { SaveIssueNotice } from "./_components/SaveIssueNotice";

export type EditorOverlayProps = {
  document: InteractiveCanvasDocument;
  /** The local board's id; empty on a linked project board. */
  canvasId: string;
  isLocalBoard: boolean;
  board: BoardDocument;
  agent: AgentRun;
  editorState: InteractiveCanvasEditorState | null;
  showAgent: boolean;
  setShowAgent: (show: boolean) => void;
};

/**
 * The editor's screen overlay: the save-issue notices, the agent's preview
 * scrim, the Agent sidebar and the camera-lock pill.
 */
export function EditorOverlay({
  document,
  canvasId,
  isLocalBoard,
  board,
  agent,
  editorState,
  showAgent,
  setShowAgent,
}: EditorOverlayProps) {
  const { projectSaveIssue, diskConflict, reloadProjectBoard, reloadLocalCanvas, keepLocalCanvas } = board;
  const { agentSession, cameraLocked, agentPreviewRect, agentBaselineDocument, agentNotes } = agent;
  return (
    <>
      {!isLocalBoard && projectSaveIssue ? (
        <SaveIssueNotice
          message={
            projectSaveIssue === "conflict"
              ? "Board changed on disk — reload to keep editing."
              : "Another session is editing this board — saving is blocked."
          }
        >
          <Button type="button" size="sm" variant="outline" onClick={reloadProjectBoard}>
            Reload
          </Button>
        </SaveIssueNotice>
      ) : null}
      {isLocalBoard && diskConflict ? (
        <SaveIssueNotice message="Canvas changed on disk.">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void reloadLocalCanvas()}
          >
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void keepLocalCanvas()}
          >
            Keep mine
          </Button>
        </SaveIssueNotice>
      ) : null}
      {cameraLocked && editorState ? (
        <GhostPreviewScrim
          previewRect={agentPreviewRect}
          viewport={editorState.viewport}
        />
      ) : null}
      {showAgent ? (
        <div className="pointer-events-auto">
          <AgentSidebar
            status={agentSession.status}
            onClose={() => setShowAgent(false)}
            acceptedResult={agentSession.acceptedResult}
            description={document.description}
            pinningTargetLabel={
              editorState?.tool === "annotation"
                ? targetLabelForSelection(document, editorState.selection)
                : undefined
            }
            queue={{
              notes: agentNotes,
              onRemoveNote: agent.handleRemoveAgentNote,
              onPanToNote: agent.handlePanToAgentNote,
              onAddNote: agent.handleAddAgentNote,
              onRun: agent.handleRunAgent,
            }}
            session={{
              canvasId,
              sessionId: agentSession.sessionId,
              attempts: agentSession.attempts,
              baselineDocument: agentBaselineDocument ?? document,
              proposal: agentSession.proposal,
              lastGoodProposal: agentSession.lastGoodProposal,
              abandoned: agentSession.abandonment,
              error: agentSession.error,
              harnessUnavailable: agentSession.harnessUnavailable,
              acceptConflict: agentSession.acceptConflict,
              onRefine: async (instruction) => {
                await agentSession.refine(instruction);
              },
              onAccept: agentSession.accept,
              onReject: agentSession.reject,
              onRetry: () => agent.restartAgentRun(),
              onClose: () => setShowAgent(false),
              onDiscardConflict: agentSession.reject,
              onTryAgainOnCurrentBoard: () => agent.restartAgentRun(),
              onStartOver: agent.restartAgentRun,
            }}
          />
        </div>
      ) : null}
      {cameraLocked ? (
        <CameraLockPill onStop={() => void agentSession.stop()} />
      ) : null}
    </>
  );
}
