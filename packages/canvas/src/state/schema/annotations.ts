"use client";

import type { CanvasGeometry } from "./objects";

export type CanvasAnnotationIntent = "note" | "agent-request";

export type CanvasAnnotationStatus = "open" | "applied" | "resolved";

export type CanvasAnnotationTarget =
  | { kind: "object"; objectId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "region"; region: CanvasGeometry };

export type InteractiveCanvasAnnotation = {
  id: string;
  target: CanvasAnnotationTarget;
  intent: CanvasAnnotationIntent;
  body: string;
  status: CanvasAnnotationStatus;
  createdBy: "human" | "agent" | "system";
  createdAt?: string;
};
