import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { Input } from "@codecaine-ai/canvas/ui/input";
import { LinkIcon } from "@codecaine-ai/canvas/ui/icons";
import { navigate } from "../navigation";
import {
  getProjectServerOrigin,
  listProjectBoards,
  normalizeProjectServerOrigin,
  setProjectServerOrigin,
  type ProjectBoardListItem,
} from "./docs-server";

const LIST_TIMEOUT_MS = 4000;

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Project boards" list section — boards from a linked docs project's
 * docs-server, edited in place over HTTP (never copied into canvases/).
 * When the linked server is unreachable this stays a quiet one-liner.
 */
export function ProjectBoardsSection() {
  const [origin, setOrigin] = useState(getProjectServerOrigin);
  const [boards, setBoards] = useState<ProjectBoardListItem[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "offline">("loading");
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [originDraft, setOriginDraft] = useState(origin);

  const loadBoards = useCallback(async (serverOrigin: string) => {
    setState("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
    try {
      const result = await listProjectBoards(serverOrigin, controller.signal);
      result.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      setBoards(result);
      setState("idle");
    } catch {
      // Server down or unreachable — quiet not-connected state, no error spam.
      setBoards([]);
      setState("offline");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void loadBoards(origin);
  }, [loadBoards, origin]);

  const submitOrigin = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeProjectServerOrigin(originDraft);
    if (!normalized) return;
    setProjectServerOrigin(normalized);
    setOriginDraft(normalized);
    setEditingOrigin(false);
    setOrigin(normalized);
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Project boards
        </h2>
        {editingOrigin ? (
          <form onSubmit={submitOrigin} className="flex items-center gap-2">
            <Input
              value={originDraft}
              onChange={(event) => setOriginDraft(event.target.value)}
              placeholder="http://localhost:4803"
              aria-label="Linked project server origin"
              autoFocus
              className="h-8 w-56 text-xs"
            />
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setOriginDraft(origin);
                setEditingOrigin(false);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditingOrigin(true)}
            title="Change the linked project server"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {origin}
          </button>
        )}
      </div>
      {state === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading project boards...</p>
      ) : state === "offline" ? (
        <p className="text-sm text-muted-foreground">
          No linked project connected at {origin}.
        </p>
      ) : boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The linked project has no canvas boards yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {boards.map((board) => (
            <button
              key={board.src}
              type="button"
              onClick={() => navigate(`/?src=${encodeURIComponent(board.src)}`)}
              className="group overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:bg-muted/50"
            >
              <span className="block px-4 py-3">
                <span className="block truncate text-sm font-medium">
                  {board.title ?? board.id ?? board.src}
                </span>
                <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                  {board.src}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Updated {formatUpdatedAt(board.updated_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
