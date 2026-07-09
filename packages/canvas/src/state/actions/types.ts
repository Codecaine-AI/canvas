"use client";

import type { Anchor } from "../../routing/routing";
import type {
  CanvasAnnotationTarget,
  CanvasArrowDirection,
  CanvasColor,
  CanvasIconGlyph,
  CanvasShapeDirection,
  CanvasConnectionStyle,
  CanvasGeometry,
  InteractiveCanvasAnnotation,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../schema";
import type { CanvasColorKind } from "../schema/object-defaults";

export type CanvasTool =
  | "select"
  | "hand"
  | "rectangle"
  | "process"
  | "decision"
  | "sticky"
  | "annotation-marker"
  | "annotation"
  // D16 — expanded vocabulary (checkpoint 5):
  | "document"
  | "database"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  // Connector Mode — wiring-mode tool, not a placeable object type, so the
  // 1:1 tool<->type pattern documented below does not apply to it.
  | "connector"
  // W5 — FigJam parity shape set (Wave A): one tool per new placeable object
  // type, mirroring the 1:1 tool<->type pattern every prior wave established
  // above (ShapesPanel/dock wiring for these is Wave C's concern, not this
  // wave's — see the implementation brief's file-ownership table — but the
  // CanvasTool union itself lives here, and objectTypeForTool's switch in
  // interaction.ts already has a safe `default: return null` for any tool
  // it doesn't recognize, so adding these entries here doesn't obligate a
  // change there).
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "pentagon"
  | "octagon"
  | "star"
  | "plus"
  | "chevron"
  | "folder"
  | "document-stack"
  | "off-page-connector"
  | "trapezoid"
  | "manual-input"
  | "hexagon"
  | "internal-storage"
  | "or-junction"
  | "summing-junction"
  | "cylinder-horizontal"
  | "page-corner"
  | "icon";

export type CanvasSelection =
  | { kind: "none" }
  | { kind: "objects"; objectIds: string[] }
  | { kind: "connection"; connectionId: string }
  | { kind: "annotation"; annotationId: string }
  | { kind: "region"; region: CanvasGeometry };

export type CanvasAgentPatchOperation =
  | {
      type: "addObject";
      object: InteractiveCanvasObject;
    }
  | {
      type: "updateObject";
      objectId: string;
      patch: Partial<Omit<InteractiveCanvasObject, "id">>;
    }
  | {
      type: "addConnection";
      connection: InteractiveCanvasConnection;
    }
  | {
      type: "addAnnotation";
      annotation: InteractiveCanvasAnnotation;
    }
  | {
      type: "fitSectionToChildren";
      sectionId: string;
      padding?: number;
    };

export type CanvasAction =
  | { type: "canvas.select"; selection: CanvasSelection }
  | { type: "canvas.setTool"; tool: CanvasTool }
  | { type: "canvas.updateDocumentTitle"; title: string }
  | {
      type: "canvas.addObject";
      objectType: InteractiveCanvasObjectType;
      /** Seed for the object's unified `text` field; omit for the per-type default (type label for shapes/sections, empty for sticky/code-block). */
      text?: string;
      parentId?: string | null;
      geometry?: CanvasGeometry;
      /** Explicit color pick for the new object; omit to take the last-picked memory for its kind (D17). */
      color?: CanvasColor;
      /** Shapes-panel catalog-entry variant: orientation for direction-aware shapes (triangle up/down, arrow left/right). */
      direction?: CanvasShapeDirection;
      /** Shapes-panel catalog-entry variant: Advanced-tier glyph for `objectType: "icon"` — without it an icon object renders blank. */
      icon?: CanvasIconGlyph;
    }
  | { type: "canvas.duplicateSelection" }
  | {
      type: "canvas.addObjects";
      objects: InteractiveCanvasObject[];
      connections?: InteractiveCanvasConnection[];
      select?: boolean;
    }
  | {
      type: "canvas.updateObject";
      objectId: string;
      patch: Partial<Omit<InteractiveCanvasObject, "id">>;
    }
  | {
      type: "canvas.setObjectType";
      objectId: string;
      objectType: InteractiveCanvasObjectType;
    }
  | { type: "canvas.deleteSelection" }
  | {
      type: "canvas.moveSelection";
      dx: number;
      dy: number;
      snap?: boolean;
    }
  | {
      type: "canvas.resizeObject";
      objectId: string;
      width: number;
      height: number;
      snap?: boolean;
    }
  | {
      type: "canvas.updateObjectGeometries";
      geometries: Record<string, CanvasGeometry>;
      recordHistory?: boolean;
      snap?: boolean;
      summary?: string;
    }
  | {
      type: "canvas.reconcileSectionMembership";
      recordHistory?: boolean;
    }
  | {
      type: "canvas.setParent";
      objectIds: string[];
      parentId: string | null;
    }
  | {
      type: "canvas.addConnection";
      fromObjectId: string;
      toObjectId: string;
      label?: string;
      style?: CanvasConnectionStyle;
      arrow?: CanvasArrowDirection;
      fromAnchor?: Anchor;
      toAnchor?: Anchor;
      /**
       * Exact relative attach point on the `to` object's bounds, [0..1, 0..1]
       * (W3b): stored as the endpoint's `position` when a connector-create
       * drop snapped to the shape's outline off-anchor (or to a true-outline
       * anchor that isn't the bbox side midpoint). Routing honors it over the
       * coarse `toAnchor` side.
       */
      toPosition?: [number, number];
    }
  | {
      type: "canvas.updateConnection";
      connectionId: string;
      patch: Partial<Omit<InteractiveCanvasConnection, "id">>;
    }
  | {
      type: "canvas.deleteConnection";
      connectionId: string;
    }
  | {
      type: "canvas.quickConnect";
      fromObjectId: string;
      fromAnchor?: Anchor;
      drop:
        | { objectId: string; anchor: Anchor }
        | { point: { x: number; y: number } };
    }
  | {
      type: "canvas.addAnnotation";
      target: CanvasAnnotationTarget;
      body: string;
      intent?: "note" | "agent-request";
    }
  | {
      type: "canvas.alignSelection";
      axis: "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
    }
  | { type: "canvas.distributeSelection"; axis: "horizontal" | "vertical" }
  | { type: "canvas.fitSectionToChildren"; sectionId: string; padding?: number }
  // W6 — records geometric capture as persisted membership: sets
  // parentId = sectionId for objects sectionCaptureMembers() finds whose
  // current parentId is null.
  | { type: "canvas.captureSectionContents"; sectionId: string }
  | { type: "canvas.undo" }
  | { type: "canvas.redo" }
  | { type: "canvas.reset"; document: InteractiveCanvasDocument };

export type CanvasChangeSummary = {
  source: "human" | "agent";
  summary: string;
  changedObjectIds: string[];
  changedConnectionIds: string[];
  changedAnnotationIds: string[];
};

export type InteractiveCanvasState = {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  tool: CanvasTool;
  history: {
    past: InteractiveCanvasDocument[];
    future: InteractiveCanvasDocument[];
  };
  lastChange?: CanvasChangeSummary;
  /**
   * Last-picked color memory (P1, D17), per kind: every color pick made
   * through canvas.updateObject / canvas.updateConnection updates its kind's
   * bucket, and new objects created via place / quick-connect take the
   * remembered pick. Seeded with the per-kind first-use fallbacks
   * (FIRST_USE_COLORS); editor-session state, not history-tracked.
   */
  lastPickedColor: Record<CanvasColorKind, CanvasColor>;
};
