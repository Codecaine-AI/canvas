"use client";

import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";

/**
 * Container renders pixel/DOM-identically to ObjectShape's plain default
 * rounded-rect path: generic button chrome, standard label/body spans, and
 * optional edge ports. Its behavioral flags are declared-only in this
 * registry step; interaction/hit-testing.ts remains authoritative for the
 * RESTRUCTURE.md "Facts to preserve" rule that containers hit-test on a 16px
 * border band while interiors pass through.
 */
function ContainerObjectView(props: ObjectRenderProps) {
  const { object, compact, showPorts, zoom = 1, hideLabel } = props;
  return (
    <ObjectButtonChrome
      object={object}
      renderShape="rounded-rect"
      className="interactive-canvas-object"
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

export const containerDef: ObjectDef = {
  kind: "container",
  render: ContainerObjectView,
  css: "",
  defaults: {
    geometry: { x: 80, y: 80, width: 360, height: 240 },
    tone: "neutral",
    label: "Container",
  },
  handles: "all",
  hitTest: "border-band",
  dragCapture: "descendants",
  labelEditing: { target: "label" },
};
