import { useState, type FormEvent } from "react";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { PlusIcon, XIcon } from "@codecaine-ai/canvas/ui/icons";
import { Textarea } from "@codecaine-ai/canvas/ui/textarea";
import type { PendingNote } from "./pending-notes";

export interface QueueViewProps {
  notes: readonly PendingNote[];
  onRemoveNote(noteId: string): void;
  onPanToNote(note: PendingNote): void;
  onAddNote(): void;
  onRun(globalComment: string): void | Promise<void>;
  isStarting?: boolean;
  initialGlobalComment?: string;
  /** Undefined outside annotate mode; null while annotate mode has no object target. */
  pinningTargetLabel?: string | null;
}

function runLabel(noteCount: number): string {
  if (noteCount === 0) return "Ask";
  return `Apply ${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
}

export function QueueView({
  notes,
  onRemoveNote,
  onPanToNote,
  onAddNote,
  onRun,
  isStarting = false,
  initialGlobalComment = "",
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
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Pending ({notes.length})
            </h2>
            <Button type="button" size="xs" variant="outline" onClick={onAddNote}>
              <PlusIcon className="h-3 w-3" />
              Add note
            </Button>
          </div>

          {pinningTargetLabel !== undefined ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {pinningTargetLabel
                ? `Pinning to: ${pinningTargetLabel}`
                : "Click an object to pin a note"}
            </p>
          ) : null}

          {notes.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Right-click anything and choose &lsquo;Note to AI&rsquo; to queue a request.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="group flex items-start gap-1 rounded-md border border-border/70 bg-card/70 p-1"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => onPanToNote(note)}
                  >
                    <span className="block truncate text-xs font-medium">{note.targetLabel}</span>
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
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
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">
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
