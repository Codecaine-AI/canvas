"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { objectDefForType } from "../../../objects/object-def";
import type { CanvasAction } from "../../../state/actions";
import type { CanvasPoint } from "../../../state/geometry";
import { routeConnection } from "../../../routing/routing";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../state/schema";

export interface UseLabelEditingArgs {
  document: InteractiveCanvasDocument;
  dispatch: (action: CanvasAction) => void;
}

export interface LabelEditingApi {
  /** Connection whose label is being edited inline, or null when closed. */
  labelEditConnectionId: string | null;
  labelEditValue: string;
  setLabelEditValue: Dispatch<SetStateAction<string>>;
  /** World-space anchor for the connector label input (routed label midpoint). */
  labelEditPoint: CanvasPoint | null;
  openConnectionLabelEditor: (connectionId: string) => void;
  commitConnectionLabel: () => void;
  cancelConnectionLabelEdit: () => void;
  /** Object whose label is being edited inline, or null when closed. */
  objectLabelEditId: string | null;
  setObjectLabelEditId: Dispatch<SetStateAction<string | null>>;
  objectLabelEditValue: string;
  setObjectLabelEditValue: Dispatch<SetStateAction<string>>;
  /** The document object matching objectLabelEditId (undefined when closed). */
  objectLabelEditTarget: InteractiveCanvasObject | undefined;
  openObjectLabelEditor: (objectId: string) => void;
  commitObjectLabel: () => void;
  cancelObjectLabelEdit: () => void;
}

/**
 * Inline label editing (connector labels + object labels/section titles/bodies),
 * extracted verbatim from InteractiveCanvasEditor.tsx. Owns the two editor
 * states and their open/commit/cancel callbacks; the raw setters are exposed
 * because the editor's one-shot interaction signal (overlay.editObjectLabelId)
 * can target a freshly created object before it exists in the rendered
 * document. Existing objects should open through openObjectLabelEditor so the
 * ObjectDef labelEditing target controls the seeded field.
 */
export function useLabelEditing({ document, dispatch }: UseLabelEditingArgs): LabelEditingApi {
  const [labelEditConnectionId, setLabelEditConnectionId] = useState<string | null>(null);
  const [labelEditValue, setLabelEditValue] = useState("");
  // Inline OBJECT label editor (4.2.1) — distinct from the connector label
  // editor above. Opened by the interaction machine's double-click intent
  // (overlay.editObjectLabelId) for both existing objects and freshly created
  // ones (typing starts immediately after a canvas double-click).
  const [objectLabelEditId, setObjectLabelEditId] = useState<string | null>(null);
  const [objectLabelEditValue, setObjectLabelEditValue] = useState("");

  const labelEditConnection = document.connections.find(
    (connection) => connection.id === labelEditConnectionId,
  );
  const labelEditFromObject = labelEditConnection
    ? document.objects.find((object) => object.id === labelEditConnection.from.objectId)
    : undefined;
  const labelEditToObject = labelEditConnection
    ? document.objects.find((object) => object.id === labelEditConnection.to.objectId)
    : undefined;
  const labelEditPoint =
    labelEditConnection && labelEditFromObject && labelEditToObject
      ? routeConnection(labelEditFromObject, labelEditToObject, labelEditConnection, document.objects).labelPoint
      : null;

  const openConnectionLabelEditor = useCallback(
    (connectionId: string) => {
      const connection = document.connections.find((item) => item.id === connectionId);
      setLabelEditConnectionId(connectionId);
      setLabelEditValue(connection?.label ?? "");
    },
    [document.connections],
  );

  const commitConnectionLabel = useCallback(() => {
    if (!labelEditConnectionId) return;
    dispatch({
      type: "canvas.updateConnection",
      connectionId: labelEditConnectionId,
      patch: { label: labelEditValue.trim() === "" ? undefined : labelEditValue },
    });
    setLabelEditConnectionId(null);
    setLabelEditValue("");
  }, [labelEditConnectionId, labelEditValue, dispatch]);

  const cancelConnectionLabelEdit = useCallback(() => {
    setLabelEditConnectionId(null);
    setLabelEditValue("");
  }, []);

  const objectLabelEditTarget = document.objects.find(
    (object) => object.id === objectLabelEditId,
  );

  const openObjectLabelEditor = useCallback(
    (objectId: string) => {
      const object = document.objects.find((item) => item.id === objectId);
      const target = object ? objectDefForType(object.type)?.labelEditing.target : undefined;
      setObjectLabelEditId(objectId);
      setObjectLabelEditValue(
        target === "body"
          ? (object?.body ?? "")
          : target === "section-title"
            ? (object?.title ?? object?.label ?? "")
            : (object?.label ?? ""),
      );
    },
    [document.objects],
  );

  const commitObjectLabel = useCallback(() => {
    if (!objectLabelEditId) return;
    const target = document.objects.find((object) => object.id === objectLabelEditId);
    const labelEditingTarget = target ? objectDefForType(target.type)?.labelEditing.target : undefined;
    dispatch({
      type: "canvas.updateObject",
      objectId: objectLabelEditId,
      patch:
        labelEditingTarget === "body"
          ? { body: objectLabelEditValue }
          : labelEditingTarget === "section-title" && target
            ? { title: objectLabelEditValue.trim() || target.title || target.label, label: objectLabelEditValue.trim() || target.label }
            : { label: objectLabelEditValue },
    });
    setObjectLabelEditId(null);
    setObjectLabelEditValue("");
  }, [objectLabelEditId, objectLabelEditValue, dispatch, document.objects]);

  const cancelObjectLabelEdit = useCallback(() => {
    setObjectLabelEditId(null);
    setObjectLabelEditValue("");
  }, []);

  return {
    labelEditConnectionId,
    labelEditValue,
    setLabelEditValue,
    labelEditPoint,
    openConnectionLabelEditor,
    commitConnectionLabel,
    cancelConnectionLabelEdit,
    objectLabelEditId,
    setObjectLabelEditId,
    objectLabelEditValue,
    setObjectLabelEditValue,
    objectLabelEditTarget,
    openObjectLabelEditor,
    commitObjectLabel,
    cancelObjectLabelEdit,
  };
}
