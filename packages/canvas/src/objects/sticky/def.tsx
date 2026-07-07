"use client";

import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";

/** Sticky geometry/typography (moved from theme/tokens.ts in the theme dispersal — per-kind constants co-locate with their def; also consumed by render/CanvasStage). */
export const STICKY_GEOMETRY = {
  cornerRadiusPx: 0,
  foldedCorner: false,
  defaultSizePx: { width: 416, height: 420 },
  textInsetLeftPx: 21,
  textInsetTopPx: 28,
  bodyFontSizePx: 24,
  bodyLineHeightPx: 36,
  bodyTextColor: "rgba(0, 0, 0, 0.8)",
  /** Down-biased falloff shadow. */
  shadow: "0 3px 12px rgba(0, 0, 0, 0.15)",
} as const;

/**
 * FigJam sticky note (W2 upgrade) — the generic button chrome plus sticky-
 * specific body rendering: "- " prefixed body lines become bullets. Dispatched
 * on the effective render shape "note" (a sticky-typed object without
 * `style.shape` keeps falling through to the rounded-rect path, as before).
 */
function StickyObjectView(props: ObjectRenderProps) {
  const { object, showPorts, zoom = 1, hideLabel } = props;
  // W2 — sticky upgrade: "- " bullet rendering in the body text.
  const bodyLines = (object.body ?? "").split("\n");
  return (
    <ObjectButtonChrome
      object={object}
      renderShape="note"
      className="interactive-canvas-object interactive-canvas-object-note"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {!hideLabel && (
        // hideLabel means this object's inline editor is open — for sticky, the editor replaces the body.
        <span className="interactive-canvas-object-body interactive-canvas-sticky-body">
          {bodyLines.map((line, index) => {
            const isBullet = line.startsWith("- ");
            return (
              // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
              <span key={index} className="interactive-canvas-sticky-line" data-bullet={isBullet ? "true" : undefined}>
                {isBullet ? line.slice(2) : line}
              </span>
            );
          })}
        </span>
      )}
      {showPorts && <EdgePorts object={object} zoom={zoom} />}
    </ObjectButtonChrome>
  );
}

export const stickyDef: ObjectDef = {
  kind: "sticky",
  render: StickyObjectView,
  css: `
        /*
         * W2 — sticky is the ONLY object type with a shadow (per spec, every
         * other shape is flat/shadowless). Square corners (STICKY_GEOMETRY.
         * cornerRadiusPx = 0), the measured down-biased shadow, and
         * body typography all live here.
         */
        .interactive-canvas-object-note {
          justify-content: flex-start;
          border-radius: ${STICKY_GEOMETRY.cornerRadiusPx}px;
          box-shadow: ${STICKY_GEOMETRY.shadow};
        }
        .interactive-canvas-object-note[data-changed="true"] {
          box-shadow:
            0 0 0 5px color-mix(in oklab, var(--primary) 18%, transparent),
            ${STICKY_GEOMETRY.shadow};
        }
        .interactive-canvas-sticky-line[data-bullet="true"] {
          position: relative;
          padding-left: 1em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"]::before {
          content: "•";
          position: absolute;
          left: 0;
        }
`,
  /*
   * CASCADE NOTE: `.interactive-canvas-sticky-body` deliberately did NOT move
   * here — it stays in CanvasStage's legacy block. The sticky body span
   * carries BOTH `.interactive-canvas-object-body` and
   * `.interactive-canvas-sticky-body` (same 0,1,0 specificity), and the
   * sticky rule's non-!important color/font-size/line-height currently LOSE
   * to `.interactive-canvas-object-body` by source order. Appending the rule
   * after the legacy block would silently flip those winners.
   */
  defaults: {
    geometry: { x: 180, y: 180, width: 176, height: 128 },
    tone: "warning",
    shape: "note",
    label: "Sticky",
  },
  handles: "all",
  hitTest: "solid",
  dragCapture: "none",
  toolbar: {
    // Sticky toolbar has one color pick plus a text button for the body editor.
    controls: [
      { action: "color", label: "Sticky color", hasFlyout: true },
      { action: "text", label: "Edit text" },
    ],
  },
  labelEditing: { target: "body" },
};
