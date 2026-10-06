import type { RefObject } from "react";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasDocument,
  type InteractiveCanvasEditorHandle,
  type InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ArrowLeftIcon } from "@codecaine-ai/canvas/ui/icons";
import type { AgentRun } from "@/_lib/useAgentRun";
import type { BoardDocument } from "@/_lib/useBoardDocument";
import type { EditorPanels } from "@/_lib/useEditorPanels";
import { devPagesEnabled } from "@/shared/dev-flag";
import type { CanvasStyleSettingsController } from "@/shared/useCanvasStyleSettings";
import { DevRail } from "./_components/DevRail";
import { EditorActions } from "./_components/EditorActions";
import { EditorOverlay } from "./_components/EditorOverlay";
import { GhostPreviewLayer } from "./_components/GhostPreviewLayer";
import { StyleRail } from "./_components/StyleRail";

export type EditorPageProps = {
  /** A local board (/canvas/<id>) or a linked project's board (/?src=). */
  route: { name: "canvas"; id: string } | { name: "project"; src: string; server?: string };
  document: InteractiveCanvasDocument;
  /** Bumped to remount the uncontrolled editor after a change made outside it. */
  documentRevision: number;
  canvasStyleSettings: CanvasStyleSettingsController;
  panels: EditorPanels;
  board: BoardDocument;
  agent: AgentRun;
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
  editorState: InteractiveCanvasEditorState | null;
  onEditorStateChange: (state: InteractiveCanvasEditorState) => void;
  onBack: () => void;
};

/**
 * The full-screen board editor, outside the shell: the canvas package's
 * editor with the Style rail, the agent overlay and its preview layer, and
 * (dev pages) the Dev rail.
 */
export function EditorPage({
  route,
  document,
  documentRevision,
  canvasStyleSettings,
  panels,
  board,
  agent,
  editorRef,
  editorState,
  onEditorStateChange,
  onBack,
}: EditorPageProps) {
  const { showAgent, setShowAgent, showStyle, setShowStyle, showInspector } = panels;
  const { agentSession, cameraLocked, agentBaselineDocument, visibleAgentProposal, agentWorkFrame } = agent;
  const devRail = devPagesEnabled();
  const isLocalBoard = route.name === "canvas";

  return (
    <div className="min-h-screen bg-background p-4">
      <InteractiveCanvasEditor
        key={`${document.id}:${documentRevision}`}
        document={document}
        editableTitle
        canvasStyle={canvasStyleSettings.style}
        showInspector={showInspector && !showAgent && !showStyle}
        // A side panel, not a screenOverlay: the overlay sits inside the
        // stage, where a click would hit-test the board under the rail and
        // the wheel would pan the board instead of scrolling the rail.
        sidePanel={
          showStyle && !showAgent ? (
            <StyleRail
              settings={canvasStyleSettings.settings}
              style={canvasStyleSettings.style}
              overrides={canvasStyleSettings.overrides}
              onSelectTheme={canvasStyleSettings.setTheme}
              onChange={canvasStyleSettings.setToken}
              onResetKey={canvasStyleSettings.resetToken}
              onResetTheme={canvasStyleSettings.resetTheme}
              onClose={() => setShowStyle(false)}
            />
          ) : undefined
        }
        onDocumentChange={board.queueAutosave}
        topBarLeading={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back to boards"
            title="Back to boards"
            onClick={onBack}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        }
        ref={editorRef}
        onEditorStateChange={onEditorStateChange}
        cameraOnly={cameraLocked}
        worldOverlay={cameraLocked && isLocalBoard ? (
          <GhostPreviewLayer
            canvasId={route.id}
            sessionId={agentSession.sessionId}
            refreshSignal={agentSession.previewRefreshSignal}
            baselineDocument={agentBaselineDocument ?? document}
            proposal={visibleAgentProposal}
            workFrame={agentWorkFrame}
            onPreviewRectChange={agent.setAgentPreviewRect}
          />
        ) : undefined}
        screenOverlay={
          <EditorOverlay
            document={document}
            canvasId={route.name === "canvas" ? route.id : ""}
            isLocalBoard={isLocalBoard}
            board={board}
            agent={agent}
            editorState={editorState}
            showAgent={showAgent}
            setShowAgent={setShowAgent}
          />
        }
        topBarActions={
          <EditorActions panels={panels} isLocalBoard={isLocalBoard} agentNoteCount={agent.agentNotes.length} />
        }
      />
      {devRail ? (
        <DevRail
          document={document}
          editorState={editorState}
          editorRef={editorRef}
        />
      ) : null}
    </div>
  );
}
