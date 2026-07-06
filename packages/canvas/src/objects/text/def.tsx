"use client";

import { TEXT_SIZES_PX } from "../../render/figjam-tokens";
import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";

/**
 * Text objects are the W2 borderless bold label special. They are dispatched
 * by effective render shape "label", the historical no-style-shape fallback
 * for type "text"; explicit style.shape values still keep the legacy
 * override behavior through the render-shape registry.
 */
function TextObjectView(props: ObjectRenderProps) {
  const { object, compact, showPorts, zoom = 1, hideLabel } = props;
  return (
    <ObjectButtonChrome
      object={object}
      renderShape="label"
      className="interactive-canvas-object interactive-canvas-object-text-shape"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {!hideLabel && <span className="interactive-canvas-object-label">{object.label}</span>}
      {object.body && !compact && <span className="interactive-canvas-object-body">{object.body}</span>}
      {showPorts && <EdgePorts object={object} zoom={zoom} />}
    </ObjectButtonChrome>
  );
}

export const textDef: ObjectDef = {
  kind: "text",
  render: TextObjectView,
  css: `
        /* CASCADE NOTE: the scoped label selector below has higher specificity
           (0,2,0) than the bare .interactive-canvas-object-label base rule
           (0,1,0), so it wins independent of its appended source order. */
        /* W2 — standalone text/"label" objects: bold black FigJam label, no box. */
        .interactive-canvas-object-text-shape {
          border: none;
          background: transparent !important;
          box-shadow: none;
          padding: 4px;
        }
        .interactive-canvas-object-text-shape .interactive-canvas-object-label {
          font-weight: 700;
          font-size: ${TEXT_SIZES_PX.boldLabel}px;
          color: #000000;
        }
        .interactive-canvas-object-text-shape:hover,
        .interactive-canvas-object-text-shape[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 3px;
        }
`,
  defaults: {
    geometry: { x: 160, y: 160, width: 184, height: 96 },
    tone: "neutral",
    // model/actions/defaults.ts cannot currently express this: shapeForType("text")
    // falls through to "rounded-rect", while rendering uses the "label" fallback.
    // The registry default records the semantic/effective render shape for step 6.
    shape: "label",
    label: "Text",
  },
  handles: "all",
  hitTest: "solid",
  dragCapture: "none",
  labelEditing: { target: "label" },
};
