"use client";

import {
  objectDefFor,
  renderShapeFor,
  type ObjectRenderProps,
} from "../objects/object-def";
import { EdgePorts, ObjectButtonChrome } from "../objects/object-chrome";

/**
 * Registry-driven object renderer (RESTRUCTURE.md step 4, mass conversion
 * complete): every object kind renders through its ObjectDef — `section` by
 * type, everything else by effective render shape. The generic fallback below
 * only fires for a render shape with no registered def (today that is solely
 * an explicit `style.shape: "section"` on a non-section object, which always
 * rendered the plain default chrome), reproducing the old default branch:
 * base className, plain label/body spans, edge ports.
 */
export function ObjectShape(props: ObjectRenderProps) {
  const def = objectDefFor(props.object);
  if (def) {
    const DefRender = def.render;
    return <DefRender {...props} />;
  }
  return <GenericObjectShape {...props} />;
}

function GenericObjectShape(props: ObjectRenderProps) {
  const { object, compact, showPorts, zoom = 1, hideLabel } = props;
  return (
    <ObjectButtonChrome
      object={object}
      renderShape={renderShapeFor(object)}
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
