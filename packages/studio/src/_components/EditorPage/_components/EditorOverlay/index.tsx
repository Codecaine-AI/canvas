import { Button } from "@codecaine-ai/canvas/ui/button";
import type { BoardDocument } from "@/_lib/useBoardDocument";
import { SaveIssueNotice } from "./_components/SaveIssueNotice";

export type EditorOverlayProps = {
  isLocalBoard: boolean;
  board: BoardDocument;
};

/** The editor's screen overlay: the save-issue notices. */
export function EditorOverlay({ isLocalBoard, board }: EditorOverlayProps) {
  const { projectSaveIssue, diskConflict, reloadProjectBoard, reloadLocalCanvas, keepLocalCanvas } = board;
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
    </>
  );
}
