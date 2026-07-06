"use client";

import type { CodeLink } from "../code-link";

export type CanvasLinkStatus = "resolved" | "stale" | "missing" | "unresolved";

export type InteractiveCanvasLink = {
  id: string;
  objectId: string;
  /**
   * Shared reference identity (D27): the same `CodeLink` record (named
   * `SpectreRef` in the host's docs-model) used by
   * doc.json delta `reference` spans. Type-level alias only — the persisted
   * JSON shape is unchanged (kind/path/symbol/line/section/label).
   * Import direction: interactive-canvas depends on docs-model, never the
   * other way around.
   */
  target: CodeLink;
  status: CanvasLinkStatus;
  checkedAt?: string;
};
