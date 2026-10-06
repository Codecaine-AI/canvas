import { Button } from "@codecaine-ai/canvas/ui/button";
import { BoxIcon, PanelRightIcon } from "@codecaine-ai/canvas/ui/icons";
import type { EditorPanels } from "@/_lib/useEditorPanels";

export type EditorActionsProps = {
  panels: EditorPanels;
  /** The AI toggle exists on local boards only. */
  isLocalBoard: boolean;
  /** Pinned notes waiting for the agent: the AI toggle's count. */
  agentNoteCount: number;
};

/** The editor top bar's panel toggles: Inspect, Style and (local boards) AI. */
export function EditorActions({ panels, isLocalBoard, agentNoteCount }: EditorActionsProps) {
  const { showAgent, showStyle, showInspector, toggleAgent, toggleStyle, toggleInspector } = panels;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={showInspector && !showAgent && !showStyle ? "default" : "outline"}
        aria-pressed={showInspector && !showAgent && !showStyle}
        title="Toggle the inspector (text, detail, icon, size, color)"
        onClick={toggleInspector}
      >
        <BoxIcon className="h-4 w-4" />
        Inspect
      </Button>
      <Button
        type="button"
        size="sm"
        variant={showStyle && !showAgent ? "default" : "outline"}
        aria-pressed={showStyle && !showAgent}
        title="Toggle style settings"
        onClick={toggleStyle}
      >
        <PanelRightIcon className="h-4 w-4" />
        Style
      </Button>
      {isLocalBoard ? (
        <Button
          type="button"
          size="sm"
          variant={showAgent ? "default" : "outline"}
          aria-pressed={showAgent}
          title="Toggle AI"
          onClick={toggleAgent}
        >
          <span aria-hidden="true">✦</span>
          AI
          {agentNoteCount > 0 ? (
            <span className="rounded-full bg-current/10 px-1.5 text-micro leading-ui">
              {agentNoteCount}
            </span>
          ) : null}
        </Button>
      ) : null}
    </>
  );
}
