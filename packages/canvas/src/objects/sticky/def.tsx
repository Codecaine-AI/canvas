"use client";

import { objectTypeDefaults } from "../../state/schema/object-defaults";
import { BBOX_OUTLINE } from "../geometry";
import { ObjectShell, ObjectSlotText } from "../object-shell";
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
    <ObjectShell
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
    </ObjectShell>
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
        /*
         * D14 line layout is keyed by the shared renderer/editor attrs.
         * Visual padding clamps at depth 5; bullet glyphs bucket depth 2+
         * together. Markers sit FLUSH LEFT in their 1em gutter (FigJam
         * parity): a depth-d glyph starts exactly at the depth-(d-1) text
         * column, so dots visibly align with the text grid above them.
         */
        .interactive-canvas-sticky-line[data-line-depth="0"] {
          padding-left: 0;
        }
        .interactive-canvas-sticky-line[data-line-depth="1"] {
          padding-left: 1em;
        }
        .interactive-canvas-sticky-line[data-line-depth="2"] {
          padding-left: 2em;
        }
        .interactive-canvas-sticky-line[data-line-depth="3"] {
          padding-left: 3em;
        }
        .interactive-canvas-sticky-line[data-line-depth="4"] {
          padding-left: 4em;
        }
        .interactive-canvas-sticky-line[data-line-depth="5"] {
          padding-left: 5em;
        }
        /*
         * Plain paragraphs nest 0.125em under their heading (headings anchor
         * the left margin as section titles; body text reads as their child,
         * sitting between the heading (0) and bullet text (1em)). Bullets
         * and headings keep the whole-em grid above.
         */
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="0"] {
          padding-left: 0.125em;
        }
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="1"] {
          padding-left: 1.125em;
        }
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="2"] {
          padding-left: 2.125em;
        }
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="3"] {
          padding-left: 3.125em;
        }
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="4"] {
          padding-left: 4.125em;
        }
        .interactive-canvas-sticky-line:not([data-bullet="true"]):not([data-heading])[data-line-depth="5"] {
          padding-left: 5.125em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"] {
          position: relative;
        }
        /*
         * Bullet geometry: the whole list block starts 0.25em in (mirroring
         * the paragraph nest), the glyph gutter is 0.75em wide, and each
         * nesting level steps by that same 0.75em so a depth-d glyph still
         * starts exactly at the depth-(d-1) text column.
         * glyph left = 0.25em + d*0.75em; text = glyph + 0.75em.
         */
        .interactive-canvas-sticky-line[data-bullet="true"]::before {
          position: absolute;
          width: 0.75em;
          text-align: left;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="0"] {
          padding-left: 1em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="0"]::before {
          left: 0.25em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="1"] {
          padding-left: 1.75em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="1"]::before {
          left: 1em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="2"] {
          padding-left: 2.5em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="2"]::before {
          left: 1.75em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="3"] {
          padding-left: 3.25em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="3"]::before {
          left: 2.5em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="4"] {
          padding-left: 4em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="4"]::before {
          left: 3.25em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="5"] {
          padding-left: 4.75em;
        }
        .interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="5"]::before {
          left: 4em;
        }
        .interactive-canvas-sticky-line[data-bullet-glyph="1"]::before {
          content: "•";
        }
        .interactive-canvas-sticky-line[data-bullet-glyph="2"]::before {
          content: "◦";
        }
        .interactive-canvas-sticky-line[data-bullet-glyph="3"]::before {
          content: "▪";
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
