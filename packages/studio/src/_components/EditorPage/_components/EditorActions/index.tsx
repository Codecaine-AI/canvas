import { Button } from "@codecaine-ai/canvas/ui/button";
import { BoxIcon, PanelRightIcon } from "@codecaine-ai/canvas/ui/icons";
import type { EditorPanels } from "@/_lib/useEditorPanels";

export type EditorActionsProps = {
  panels: EditorPanels;
};

/** The editor top bar's panel toggles: Inspect and Style. */
export function EditorActions({ panels }: EditorActionsProps) {
  const { showStyle, showInspector, toggleStyle, toggleInspector } = panels;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={showInspector && !showStyle ? "default" : "outline"}
        aria-pressed={showInspector && !showStyle}
        title="Toggle the inspector (text, detail, icon, size, color)"
        onClick={toggleInspector}
      >
        <BoxIcon className="h-4 w-4" />
        Inspect
      </Button>
      <Button
        type="button"
        size="sm"
        variant={showStyle ? "default" : "outline"}
        aria-pressed={showStyle}
        title="Toggle style settings"
        onClick={toggleStyle}
      >
        <PanelRightIcon className="h-4 w-4" />
        Style
      </Button>
    </>
  );
}
