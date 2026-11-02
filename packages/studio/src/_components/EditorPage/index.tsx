import type { RefObject } from "react";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasDocument,
  type InteractiveCanvasEditorHandle,
  type InteractiveCanvasEditorState,
} from "@codecaine-ai/canvas";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ArrowLeftIcon } from "@codecaine-ai/canvas/ui/icons";
import type { BoardDocument } from "@/_lib/useBoardDocument";
import type { EditorPanels } from "@/_lib/useEditorPanels";
import { devPagesEnabled } from "@/shared/dev-flag";
import type { CanvasStyleSettingsController } from "@/shared/useCanvasStyleSettings";
import { DevRail } from "./_components/DevRail";
import { EditorActions } from "./_components/EditorActions";
import { EditorOverlay } from "./_components/EditorOverlay";
import { StyleRail } from "./_components/StyleRail";

export type EditorPageProps = {
  /** A local board (/canvas/<id>) or a linked project's board (/?src=). */
  route: { name: "canvas"; id: string } | { name: "project"; src: string; server?: string };
  document: InteractiveCanvasDocument;
  canvasStyleSettings: CanvasStyleSettingsController;
  panels: EditorPanels;
  board: BoardDocument;
  editorRef: RefObject<InteractiveCanvasEditorHandle | null>;
  editorState: InteractiveCanvasEditorState | null;
  onEditorStateChange: (state: InteractiveCanvasEditorState) => void;
  onBack: () => void;
};

/**
 * The full-screen board editor, outside the shell: the canvas package's
 * editor with the Style rail, the save-issue overlay, and (dev pages) the
 * Dev rail.
 */
export function EditorPage({
  route,
  document,
  canvasStyleSettings,
  panels,
  board,
  editorRef,
  editorState,
  onEditorStateChange,
  onBack,
}: EditorPageProps) {
  const { showStyle, setShowStyle, showInspector } = panels;
  const devRail = devPagesEnabled();
  const isLocalBoard = route.name === "canvas";

  return (
    <div className="min-h-screen bg-background p-4">
      <InteractiveCanvasEditor
        key={document.id}
        document={document}
        editableTitle
        canvasStyle={canvasStyleSettings.style}
        showInspector={showInspector && !showStyle}
        // A side panel, not a screenOverlay: the overlay sits inside the
        // stage, where a click would hit-test the board under the rail and
        // the wheel would pan the board instead of scrolling the rail.
        sidePanel={
          showStyle ? (
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
        screenOverlay={<EditorOverlay isLocalBoard={isLocalBoard} board={board} />}
        topBarActions={<EditorActions panels={panels} />}
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
