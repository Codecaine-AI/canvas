import { useEffect, useState } from "react";
import type { CanvasStyleGroup } from "@codecaine-ai/canvas/style";
import { GROUP_ORDER, OPEN_GROUPS_STORAGE_KEY } from "./constants";

function readOpenGroups(): Set<CanvasStyleGroup> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY) ?? "[]") as unknown;
    return new Set(GROUP_ORDER.filter((group) => Array.isArray(raw) && raw.includes(group)));
  } catch {
    return new Set();
  }
}

/** Which groups are expanded, read from and written back to localStorage. */
export function useOpenGroups() {
  const [openGroups, setOpenGroups] = useState(readOpenGroups);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...openGroups]));
    } catch {
      // Session-only when storage is unavailable.
    }
  }, [openGroups]);

  const toggleGroup = (group: CanvasStyleGroup) => {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return { openGroups, toggleGroup };
}
