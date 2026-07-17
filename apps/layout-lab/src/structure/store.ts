import type { AlgorithmParams } from "./types";

const STORAGE_KEY = "layout-lab.structure-studio.stars.v1";

export type StarredVariation = {
  id: string;
  algorithmId: string;
  seed: number;
  params: AlgorithmParams;
};

export function variationId(algorithmId: string, seed: number, params: AlgorithmParams): string {
  const sortedParams = Object.fromEntries(
    Object.entries(params).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${algorithmId}:${seed}:${JSON.stringify(sortedParams)}`;
}

export function loadStarred(): StarredVariation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StarredVariation => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<StarredVariation>;
      return typeof candidate.id === "string"
        && typeof candidate.algorithmId === "string"
        && typeof candidate.seed === "number"
        && Boolean(candidate.params)
        && typeof candidate.params === "object";
    });
  } catch {
    return [];
  }
}

export function saveStarred(starred: readonly StarredVariation[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(starred));
  } catch {
    // Storage can be unavailable in private browsing. The in-memory state still works.
  }
}
