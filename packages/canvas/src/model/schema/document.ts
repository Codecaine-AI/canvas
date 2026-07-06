"use client";

import type { InteractiveCanvasAnnotation } from "./annotations";
import type { InteractiveCanvasConnection } from "./connections";
import type { InteractiveCanvasLink } from "./links";
import type { InteractiveCanvasObject } from "./objects";

export type InteractiveCanvasMode = "diagram";

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type InteractiveCanvasDocument = {
  schemaVersion: 1;
  id: string;
  title?: string;
  mode: InteractiveCanvasMode;
  viewport?: CanvasViewport;
  size?: {
    width: number;
    height: number;
  };
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
  links?: InteractiveCanvasLink[];
  annotations?: InteractiveCanvasAnnotation[];
};
