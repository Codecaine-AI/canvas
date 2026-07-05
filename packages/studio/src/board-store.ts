import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";

/**
 * Studio v1 persistence: local drafts only (localStorage), no backend. Each
 * draft is a full `InteractiveCanvasDocument` keyed by its own `id`. This is
 * intentionally simple — the studio app exists so boards can be created and
 * edited without a host app, not to replace a real backend.
 */
const STORAGE_KEY = "codecaine-studio-drafts";

export type StudioDraft = {
  id: string;
  title: string;
  updatedAt: string;
  document: InteractiveCanvasDocument;
};

type DraftMap = Record<string, StudioDraft>;

function readDrafts(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DraftMap;
  } catch {
    return {};
  }
}

function writeDrafts(drafts: DraftMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function listDrafts(): StudioDraft[] {
  return Object.values(readDrafts()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function saveDraft(document: InteractiveCanvasDocument): StudioDraft {
  const drafts = readDrafts();
  const draft: StudioDraft = {
    id: document.id,
    title: document.title ?? document.id,
    updatedAt: new Date().toISOString(),
    document,
  };
  drafts[document.id] = draft;
  writeDrafts(drafts);
  return draft;
}

export function deleteDraft(id: string): void {
  const drafts = readDrafts();
  delete drafts[id];
  writeDrafts(drafts);
}
