"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { objectDefFor } from "../../../objects/object-def";
import type { CanvasAction } from "../../../state/actions";
import type { CanvasPoint } from "../../../state/geometry";
import { routeConnection } from "../../../routing/routing";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../state/schema";

export interface UseTextEditingArgs {
  document: InteractiveCanvasDocument;
  dispatch: (action: CanvasAction) => void;
}

export interface TextEditingApi {
  /** Connection whose label is being edited inline, or null when closed. */
  labelEditConnectionId: string | null;
  labelEditValue: string;
  setLabelEditValue: Dispatch<SetStateAction<string>>;
  /** World-space anchor for the connector label input (routed label midpoint). */
  labelEditPoint: CanvasPoint | null;
  openConnectionLabelEditor: (connectionId: string) => void;
  commitConnectionLabel: () => void;
  cancelConnectionLabelEdit: () => void;
  /** Object whose text is being edited in place, or null when closed. */
  objectTextEditId: string | null;
  setObjectTextEditId: Dispatch<SetStateAction<string | null>>;
  objectTextEditValue: string;
  setObjectTextEditValue: Dispatch<SetStateAction<string>>;
  /** The document object matching objectTextEditId (undefined when closed). */
  objectTextEditTarget: InteractiveCanvasObject | undefined;
  openObjectTextEditor: (objectId: string) => void;
  commitObjectText: () => void;
  cancelObjectTextEdit: () => void;
}

/**
 * In-place text editing (D14: connector labels + the unified object `text`
 * field). Owns the two editor states and their open/commit/cancel callbacks;
 * the raw setters are exposed because the editor's one-shot interaction
 * signal (overlay.editObjectTextId) can target a freshly created object
 * before it exists in the rendered document. Existing objects should open
 * through openObjectTextEditor so the def's `textEditing.editable` flag is
 * respected (pure glyph shapes — plus / or-junction / summing-junction —
 * render no text and refuse the editor).
 */
export function useTextEditing({ document, dispatch }: UseTextEditingArgs): TextEditingApi {
  const [labelEditConnectionId, setLabelEditConnectionId] = useState<string | null>(null);
  const [labelEditValue, setLabelEditValue] = useState("");
  // In-place OBJECT text editor (4.2.1) — distinct from the connector label
  // editor above. Opened by the interaction machine's double-click intent
  // (overlay.editObjectTextId) for both existing objects and freshly created
  // ones (typing starts immediately after a canvas double-click).
  const [objectTextEditId, setObjectTextEditId] = useState<string | null>(null);
  const [objectTextEditValue, setObjectTextEditValue] = useState("");

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

  const objectTextEditTarget = document.objects.find(
    (object) => object.id === objectTextEditId,
  );

  const openObjectTextEditor = useCallback(
    (objectId: string) => {
      const object = document.objects.find((item) => item.id === objectId);
      // The RENDER def (objectDefFor — effective style.shape dispatch, same
      // lookup CanvasStage uses) decides editability, so what you can edit is
      // exactly what you see. Kinds without a text slot refuse the editor.
      if (object && objectDefFor(object)?.textEditing.editable === false) return;
      setObjectTextEditId(objectId);
      setObjectTextEditValue(object?.text ?? "");
    },
    [document.objects],
  );

  const commitObjectText = useCallback(() => {
    if (!objectTextEditId) return;
    const target = document.objects.find((object) => object.id === objectTextEditId);
    // Sections keep their previous title when the editor is committed empty —
    // a section chip with no text at all is unreadable (legacy behavior).
    const nextText =
      target?.type === "section" && objectTextEditValue.trim() === ""
        ? target.text
        : objectTextEditValue;
    if (target && target.text === nextText && objectTextEditValue === target.text) {
      setObjectTextEditId(null);
      setObjectTextEditValue("");
      return;
    }
    dispatch({
      type: "canvas.updateObject",
      objectId: objectTextEditId,
      patch: { text: nextText },
    });
    setObjectTextEditId(null);
    setObjectTextEditValue("");
  }, [objectTextEditId, objectTextEditValue, dispatch, document.objects]);

  const cancelObjectTextEdit = useCallback(() => {
    setObjectTextEditId(null);
    setObjectTextEditValue("");
  }, []);

  return {
    labelEditConnectionId,
    labelEditValue,
    setLabelEditValue,
    labelEditPoint,
    openConnectionLabelEditor,
    commitConnectionLabel,
    cancelConnectionLabelEdit,
    objectTextEditId,
    setObjectTextEditId,
    objectTextEditValue,
    setObjectTextEditValue,
    objectTextEditTarget,
    openObjectTextEditor,
    commitObjectText,
    cancelObjectTextEdit,
  };
}
