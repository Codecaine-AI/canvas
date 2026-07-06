"use client";

import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { SHAPE_TOOLBAR } from "../shapes/toolbar";

/**
 * Source Node renders pixel/DOM-identically to ObjectShape's plain default
 * rounded-rect path: generic button chrome, standard label/body spans, and
 * optional edge ports. Its behavioral flags are declared-only in this
 * registry step (see object-def.ts's pilot-scope note); `handles`, `hitTest`,
 * `dragCapture`, and `labelEditing` are not yet consumed by
 * interaction/editor code.
 *
 * DOM-DISPATCH CAVEAT (read before registering): `defaultGeometryFor`,
 * `toneForType`, `objectTypeLabel`, and `shapeForType` in
 * model/actions/defaults.ts all fall through to their generic defaults for
 * "source-node" TODAY — i.e. legacy ObjectShape dispatches a source-node
 * purely on `renderShapeFor(object)` (= `object.style?.shape ?? "rounded-rect"`),
 * NOT on `object.type`. Container/section are the only kinds legacy
 * special-cases by `object.type` before reading `style.shape`.
 *
 * That means source-node is NOT like container: it is not a "type-keyed
 * special" in the legacy dispatch sense. If this def is registered in
 * `DEFS_BY_TYPE` (object-def.ts) the way container/section are, ANY
 * source-node object carrying an explicit `style.shape` other than
 * "rounded-rect" (e.g. "diamond", "ellipse", ...) would be forced through
 * this plain rounded-rect view instead of the shape-specific legacy branch
 * (or another registered shape def) it renders through today — a real
 * behavior regression for such objects, not just a DOM/attribute nit.
 *
 * Registering this def in `DEFS_BY_RENDER_SHAPE` keyed on `"rounded-rect"`
 * would collide with `processDef`, which already owns that slot — so
 * source-node cannot be merged into the existing render-shape table without
 * a conflict; it can only be added safely if:
 *   (a) a repo-wide check confirms no source-node object ever carries a
 *       non-default `style.shape` (see report), and even then the DOM
 *       parity only holds for the "rounded-rect"/absent case; or
 *   (b) the def is consulted AFTER computing the effective render shape and
 *       only applied when that shape is "rounded-rect" AND the object's type
 *       is "source-node" (i.e. a compound key), which the current registry
 *       shape (object-def.ts) does not support without a change to
 *       `objectDefFor`.
 */
function SourceNodeObjectView(props: ObjectRenderProps) {
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

export const sourceNodeDef: ObjectDef = {
  kind: "source-node",
  render: SourceNodeObjectView,
  css: "",
  defaults: {
    geometry: { x: 160, y: 160, width: 184, height: 96 },
    tone: "agent",
    shape: "rounded-rect",
    label: "Source Node",
  },
  handles: "all",
  hitTest: "solid",
  dragCapture: "none",
  // Pre-migration, this type resolved to the "shape" toolbar variant.
  toolbar: SHAPE_TOOLBAR,
  labelEditing: { target: "label" },
};
