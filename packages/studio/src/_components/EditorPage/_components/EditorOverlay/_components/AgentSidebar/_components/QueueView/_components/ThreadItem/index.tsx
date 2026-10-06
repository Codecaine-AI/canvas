import { useState } from "react";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { XIcon } from "@codecaine-ai/canvas/ui/icons";
import type { PendingNote } from "@/shared/agent";
import { AUTHOR_LABELS } from "./constants";
import { replyCountLabel } from "./utils";

export type ThreadItemProps = {
  note: PendingNote;
  onRemoveNote(noteId: string): void;
  onPanToNote(note: PendingNote): void;
};

/**
 * One thread in the list: the target, who opened it, its status, and the
 * opening post. A thread with replies expands to the full transcript.
 */
export function ThreadItem({
  note,
  onRemoveNote,
  onPanToNote,
}: ThreadItemProps) {
  const [expanded, setExpanded] = useState(false);
  const askedByAgent = note.createdBy === "agent";

  return (
    <li
      data-annotation-thread={note.id}
      data-thread-author={note.createdBy}
      className={`group flex flex-col rounded border bg-card/70 p-1 ${
        askedByAgent ? "border-warning-line" : "border-border/70"
      }`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="min-w-0 flex-1 rounded px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => onPanToNote(note)}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 flex-1 truncate text-ui-xs font-medium">
              {note.targetLabel}
            </span>
            <span
              className={`shrink-0 text-micro uppercase tracking-micro ${
                askedByAgent ? "text-warning" : "text-muted-foreground"
              }`}
            >
              {askedByAgent ? `Agent asked · ${note.status}` : note.status}
            </span>
          </span>
          <span className="mt-0.5 block whitespace-pre-wrap break-words text-ui-xs leading-ui text-muted-foreground">
            {note.body}
          </span>
        </button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`Remove note for ${note.targetLabel}`}
          title="Remove note"
          onClick={() => onRemoveNote(note.id)}
        >
          <XIcon className="h-3 w-3" />
        </Button>
      </div>

      {note.replies.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            className="mx-2 mt-1 self-start rounded text-left text-ui-2xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide thread" : `Show thread · ${replyCountLabel(note.replies.length)}`}
          </button>
          {expanded ? (
            <ol className="mx-2 mb-1 mt-1.5 space-y-1.5 border-l border-border/70 pl-2">
              {note.replies.map((reply) => (
                <li key={reply.id} className="text-ui-xs leading-ui">
                  <span className="text-micro uppercase tracking-micro text-muted-foreground">
                    {AUTHOR_LABELS[reply.author]}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-wrap break-words">
                    {reply.body}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
