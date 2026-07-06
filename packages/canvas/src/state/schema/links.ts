"use client";

import type { SpectreRef } from "../spectre-ref";

export type CanvasLinkStatus = "resolved" | "stale" | "missing" | "unresolved";

export type InteractiveCanvasLink = {
  id: string;
  objectId: string;
  /**
   * Shared reference identity (D27): the same `SpectreRef` record used by
   * doc.json delta `reference` spans. Type-level alias only — the persisted
   * JSON shape is unchanged (kind/path/symbol/line/section/label).
   * Import direction: interactive-canvas depends on docs-model, never the
   * other way around.
   */
  target: SpectreRef;
  status: CanvasLinkStatus;
  checkedAt?: string;
};
