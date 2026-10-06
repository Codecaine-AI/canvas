import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { navigate } from "@/shared/navigation";
import { createStarterCanvasDocument } from "./utils";

export type CanvasListItem = {
  id: string;
  title: string;
  updated_at: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** The board list (the studio's own canvas files): load it, create the next board-N, delete one. */
export function useBoardList() {
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "error">("idle");

  const loadCanvases = useCallback(async () => {
    setListState("loading");
    try {
      const result = await fetchJson<{ canvases: CanvasListItem[] }>("/api/canvases");
      setCanvases(result.canvases);
      setListState("idle");
    } catch {
      setListState("error");
    }
  }, []);

  const usedBoardNumbers = useMemo(() => {
    const numbers = new Set<number>();
    for (const canvas of canvases) {
      const match = canvas.id.match(/^board-(\d+)$/);
      if (match) numbers.add(Number(match[1]));
    }
    return numbers;
  }, [canvases]);

  const createBoard = async () => {
    let index = 1;
    while (usedBoardNumbers.has(index)) index += 1;
    const id = `board-${index}`;
    const document = createStarterCanvasDocument({
      id,
      title: "Untitled board",
    });
    await fetchJson<{ id: string }>("/api/canvases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, canvas: document }),
    });
    navigate(`/canvas/${encodeURIComponent(id)}`);
  };

  const deleteCanvas = async (canvas: CanvasListItem, event: MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`Delete "${canvas.title}"?`)) return;
    await fetchJson<{ ok: true }>(`/api/canvases/${encodeURIComponent(canvas.id)}`, {
      method: "DELETE",
    });
    await loadCanvases();
  };

  return { canvases, listState, loadCanvases, createBoard, deleteCanvas };
}
