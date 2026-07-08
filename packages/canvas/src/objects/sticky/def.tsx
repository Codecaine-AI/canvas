"use client";

import { objectTypeDefaults } from "../../state/schema/object-defaults";
import { BBOX_OUTLINE } from "../geometry";
import { ObjectButtonChrome, ObjectSlotText } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { INSET_BODY_TEXT_SLOT } from "../text-slots";
import { StickyMarkdown } from "./markdown";

/** Sticky geometry/typography (per-kind constants co-locate with their def; the text inset/typography live on the inset-body slot preset in objects/text-slots.ts). */
export const STICKY_GEOMETRY = {
  cornerRadiusPx: 0,
  foldedCorner: false,
  defaultSizePx: { width: 416, height: 420 },
  /** Down-biased falloff shadow. */
  shadow: "0 3px 12px rgba(0, 0, 0, 0.15)",
} as const;

/**
 * FigJam sticky note (W2 upgrade, P2 text unification) — the generic button
 * chrome plus the "inset-body" text slot rendering `object.text` as simple
 * markdown (D18: H1–H3, bullets, bold, inline code). Dispatched on the
 * effective render shape "note" (a sticky-typed object without `style.shape`
 * keeps falling through to the rounded-rect path, as before). The in-place
 * editor is a live markdown preview in the same slot rect/typography; the
 * draft value still stays raw markdown, and `hideText` swaps the at-rest copy
 * out while it is open.
 */
function StickyObjectView(props: ObjectRenderProps) {
  const { object, hideText } = props;
  return (
    <ObjectButtonChrome
      object={object}
      renderShape="note"
      className="interactive-canvas-object interactive-canvas-object-note"
      // Sticky fill resolves through the sticky role table; the chrome border is suppressed.
      colorRole="sticky"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      buttonBorder="painted"
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {!hideText && (
        <ObjectSlotText
          object={object}
          slot={INSET_BODY_TEXT_SLOT}
          colorRole="sticky"
          buttonBorder="painted"
          clampChildrenToSlot
          className="interactive-canvas-sticky-body"
        >
          <StickyMarkdown text={object.text} />
        </ObjectSlotText>
      )}
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
         * cornerRadiusPx = 0) and the measured down-biased shadow live here;
         * body typography comes from the inset-body text slot.
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
        .interactive-canvas-sticky-line {
          display: block;
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
        /*
         * The live editor shows the active line's raw "- " marker; suppress
         * the decorative bullet there so the marker is not doubled.
         */
        .interactive-canvas-sticky-line[data-bullet="true"][data-sticky-markdown-line-active="true"] {
          padding-left: 0;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-sticky-markdown-line-active="true"]::before {
          content: none;
        }
`,
  // Stamped from the schema-vocabulary defaults leaf (P4) like every def.
  defaults: objectTypeDefaults("sticky"),
  colorRole: "sticky",
  buttonBorder: "painted",
  handles: "all",
  outline: BBOX_OUTLINE,
  dragCapture: "none",
  toolbar: {
    // Sticky toolbar has one color pick plus a text button for the body editor.
    controls: [
      { action: "color", label: "Sticky color", hasFlyout: true },
      { action: "text", label: "Edit text" },
    ],
  },
  textSlot: INSET_BODY_TEXT_SLOT,
  textEditing: { editable: true, markdown: true },
};
