"use client";

import type { CanvasGeometry } from "./objects";

export type CanvasAnnotationIntent = "note" | "agent-request";

export type CanvasAnnotationStatus = "open" | "applied" | "resolved";

export type CanvasAnnotationAuthor = "human" | "agent" | "system";

export type CanvasAnnotationReply = {
  id: string;
  author: CanvasAnnotationAuthor;
  body: string;
  createdAt?: string;
};

export type CanvasAnnotationTarget =
  | { kind: "object"; objectId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "region"; region: CanvasGeometry };

/**
 * One conversation anchored to a target. `body` and `createdBy` are its opening
 * post, `replies` holds everything said since oldest first, and `status` closes it.
 */
export type InteractiveCanvasAnnotation = {
  id: string;
  target: CanvasAnnotationTarget;
  intent: CanvasAnnotationIntent;
  body: string;
  status: CanvasAnnotationStatus;
  createdBy: CanvasAnnotationAuthor;
  createdAt?: string;
  replies: CanvasAnnotationReply[];
};
