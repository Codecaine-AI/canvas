import { useState, type FormEvent } from "react";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { PlusIcon } from "@codecaine-ai/canvas/ui/icons";
import { Textarea } from "@codecaine-ai/canvas/ui/textarea";
import type { PendingNote } from "@/shared/agent";
import { ThreadItem } from "./_components/ThreadItem";
import { runLabel } from "./utils";

export type QueueViewProps = {
  notes: readonly PendingNote[];
  onRemoveNote(noteId: string): void;
  onPanToNote(note: PendingNote): void;
  onAddNote(): void;
  onRun(globalComment: string): void | Promise<void>;
  isStarting?: boolean;
  initialGlobalComment?: string;
  description?: string;
  /** Undefined outside annotate mode; null while annotate mode has no object target. */
  pinningTargetLabel?: string | null;
};

export function QueueView({
  notes,
  onRemoveNote,
  onPanToNote,
  onAddNote,
  onRun,
  isStarting = false,
  initialGlobalComment = "",
  description,
  pinningTargetLabel,
}: QueueViewProps) {
  const [globalComment, setGlobalComment] = useState(initialGlobalComment);
  const trimmedComment = globalComment.trim();
  const canRun = notes.length > 0 || trimmedComment.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRun || isStarting) return;
    void onRun(trimmedComment);
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {description?.trim() ? (
          <section className="space-y-2">
            <h2 className="text-micro font-medium uppercase tracking-micro text-muted-foreground">
              Description
            </h2>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/70 bg-card/70 px-3 py-2 text-ui-xs leading-ui">
              {description}
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-micro font-medium uppercase tracking-micro text-muted-foreground">
              Pending ({notes.length})
            </h2>
            <Button type="button" size="xs" variant="outline" onClick={onAddNote}>
              <PlusIcon className="h-3 w-3" />
              Add note
            </Button>
          </div>

          {pinningTargetLabel !== undefined ? (
            <p className="text-ui-2xs leading-ui text-muted-foreground">
              {pinningTargetLabel
                ? `Pinning to: ${pinningTargetLabel}`
                : "Click an object to pin a note"}
            </p>
          ) : null}

          {notes.length === 0 ? (
            <div className="rounded border border-dashed border-border/70 px-3 py-4">
              <p className="text-ui-xs leading-ui text-muted-foreground">
                Right-click anything and choose &lsquo;Note to AI&rsquo; to queue a request.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <ThreadItem
                  key={note.id}
                  note={note}
                  onRemoveNote={onRemoveNote}
                  onPanToNote={onPanToNote}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-micro font-medium uppercase tracking-micro text-muted-foreground">
            Or globally
          </h2>
          <label className="sr-only" htmlFor="agent-global-comment">
            Ask about the whole board
          </label>
          <Textarea
            id="agent-global-comment"
            value={globalComment}
            placeholder="Ask about the whole board…"
            className="min-h-24 resize-none"
            onChange={(event) => setGlobalComment(event.target.value)}
          />
          <p className="text-ui-2xs leading-ui text-muted-foreground">
            A run applies the whole pending list.
          </p>
        </section>
      </div>

      <div className="border-t border-border/70 p-3">
        <Button type="submit" className="w-full" disabled={!canRun || isStarting}>
          {isStarting ? "Starting…" : runLabel(notes.length)}
        </Button>
      </div>
    </form>
  );
}
