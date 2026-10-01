"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  FitToContentIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PlusIcon,
  TrashIcon,
} from "../../../../ui/icons";
import { Button } from "../../../../ui/button";
import { Input } from "../../../../ui/input";
import { Textarea } from "../../../../ui/textarea";
import {
  buildSelectionContext,
  type CanvasAction,
  type CanvasChangeSummary,
} from "../../../../state/actions";
import { resolveSwatchPreview } from "../../../../theme/palette";
import { CANVAS_COLORS } from "../../../../state/schema";
import type {
  CanvasColor,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../state/schema";
import { animateSectionFitToChildren, isSectionFitted } from "../section-fit/animate-section-fit";
import { IconGlyphPicker } from "./IconGlyphPicker";

/**
 * Past this many characters (trimmed) a detail reads as more than one fact —
 * the agent's detail-too-long lint threshold (canvas-agent text-rules
 * DETAIL_MAX_CHARS). The Inspector only warns; it never blocks typing.
 */
const DETAIL_SOFT_MAX_CHARS = 48;

export interface InspectorProps {
  document: InteractiveCanvasDocument;
  lastChange: CanvasChangeSummary | undefined;
  selectedObject: InteractiveCanvasObject | undefined;
  selectedConnection: InteractiveCanvasConnection | undefined;
  selectionContext: ReturnType<typeof buildSelectionContext>;
  dispatch: (action: CanvasAction) => void;
  /** Applies a palette pick to every selected object (P1) — shared with the selection toolbar. */
  applyColorToSelection: (color: CanvasColor) => void;
}

export function Inspector({
  document,
  lastChange,
  selectedObject,
  selectedConnection,
  selectionContext,
  dispatch,
  applyColorToSelection,
}: InspectorProps) {
  const [annotationBody, setAnnotationBody] = useState("");
  const selectedSectionFitted =
    selectedObject?.type === "section" ? isSectionFitted(document, selectedObject.id) : false;
  const detailLength = selectedObject?.detail?.trim().length ?? 0;

  const addAnnotation = () => {
    const body = annotationBody.trim();
    if (!selectedObject || !body) return;
    dispatch({
      type: "canvas.addAnnotation",
      target: { kind: "object", objectId: selectedObject.id },
      body,
      intent: "agent-request",
    });
    setAnnotationBody("");
  };

  return (
    <aside
      aria-label="Inspector"
      className="absolute bottom-24 right-4 top-20 z-20 w-[320px] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur"
      // Keys pressed on the Inspector's own controls (Backspace or an arrow
      // on a just-used button) must not reach the window-level canvas
      // hotkeys, which would delete or nudge the selection being edited.
      onKeyDown={(event) => event.stopPropagation()}
    >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Inspector
      </div>
      {lastChange && (
        <div className="truncate text-[11px] text-muted-foreground">
          {lastChange.summary}
        </div>
      )}
    </div>

    {selectedObject ? (
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Text</span>
          <Textarea
            value={selectedObject.text}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateObject",
                objectId: selectedObject.id,
                patch: { text: event.target.value },
              })
            }
          />
        </label>
        {/* Stickies carry no detail line: their body is markdown. */}
        {selectedObject.type !== "sticky" && (
          <div className="text-xs">
            <label className="grid gap-1">
              <span className="text-muted-foreground">Detail</span>
              <Input
                value={selectedObject.detail ?? ""}
                placeholder="One short fact — a port, path, model"
                onChange={(event) =>
                  // Empty clears the detail (the reducer drops blank details).
                  dispatch({
                    type: "canvas.updateObject",
                    objectId: selectedObject.id,
                    patch: { detail: event.target.value },
                  })
                }
              />
            </label>
            <div role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
              {detailLength > DETAIL_SOFT_MAX_CHARS ? (
                <p className="mt-1">
                  {detailLength} / {DETAIL_SOFT_MAX_CHARS} — keep it to one short fact
                </p>
              ) : null}
            </div>
          </div>
        )}
        {selectedObject.type === "section" && (
          <IconGlyphPicker
            key={selectedObject.id}
            label="Icon"
            value={selectedObject.icon}
            allowNone
            onPick={(icon) =>
              // icon: undefined removes the header icon (JSON drops it on save).
              dispatch({ type: "canvas.updateObject", objectId: selectedObject.id, patch: { icon } })
            }
          />
        )}
        {selectedObject.type === "icon" && (
          <IconGlyphPicker
            key={selectedObject.id}
            label="Glyph"
            value={selectedObject.icon}
            onPick={(icon) =>
              dispatch({ type: "canvas.updateObject", objectId: selectedObject.id, patch: { icon } })
            }
          />
        )}
        <div className="grid grid-cols-4 gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Move left"
            title="Move left"
            onClick={() => dispatch({ type: "canvas.moveSelection", dx: -16, dy: 0 })}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Move right"
            title="Move right"
            onClick={() => dispatch({ type: "canvas.moveSelection", dx: 16, dy: 0 })}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Move up"
            title="Move up"
            onClick={() => dispatch({ type: "canvas.moveSelection", dx: 0, dy: -16 })}
          >
            <ArrowUpIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Move down"
            title="Move down"
            onClick={() => dispatch({ type: "canvas.moveSelection", dx: 0, dy: 16 })}
          >
            <ArrowDownIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SizeInput
            key={`${selectedObject.id}:width`}
            label="Object width"
            value={selectedObject.geometry.width}
            onCommit={(width) =>
              dispatch({
                type: "canvas.resizeObject",
                objectId: selectedObject.id,
                width,
                height: selectedObject.geometry.height,
              })
            }
          />
          <SizeInput
            key={`${selectedObject.id}:height`}
            label="Object height"
            value={selectedObject.geometry.height}
            onCommit={(height) =>
              dispatch({
                type: "canvas.resizeObject",
                objectId: selectedObject.id,
                width: selectedObject.geometry.width,
                height,
              })
            }
          />
        </div>
        <div className="grid gap-1.5 text-xs">
          <span className="text-muted-foreground">Color</span>
          {/* P1/D12 — the universal 10-hue roster; previews are the swatch
              hexes themselves, identical for every kind. */}
          <div className="flex flex-wrap gap-1.5">
            {CANVAS_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`Set color: ${color}`}
                aria-pressed={selectedObject.color === color}
                data-canvas-color-swatch={color}
                data-selected={selectedObject.color === color ? "true" : undefined}
                className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: resolveSwatchPreview(color),
                  borderColor:
                    selectedObject.color === color ? "var(--foreground)" : "var(--border)",
                }}
                onClick={() => applyColorToSelection(color)}
              />
            ))}
          </div>
        </div>
        {selectedObject.type === "section" && (
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            aria-disabled={selectedSectionFitted}
            disabled={selectedSectionFitted}
            onClick={() => {
              if (selectedSectionFitted) return;
              animateSectionFitToChildren({
                document,
                dispatch,
                sectionId: selectedObject.id,
              });
            }}
          >
            <FitToContentIcon className="h-4 w-4" />
            Fit children
          </Button>
        )}
        <div className="rounded-md border border-border/70 p-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MessageSquareIcon className="h-3.5 w-3.5" />
            Annotation
          </div>
          <Textarea
            value={annotationBody}
            onChange={(event) => setAnnotationBody(event.target.value)}
            placeholder="Add a request or note"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={addAnnotation}
            disabled={!annotationBody.trim()}
          >
            <PlusIcon className="h-4 w-4" />
            Annotate
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => dispatch({ type: "canvas.deleteSelection" })}
        >
          <TrashIcon className="h-4 w-4" />
          Delete
        </Button>
      </div>
    ) : selectedConnection ? (
      <div className="grid gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <GitBranchIcon className="h-3.5 w-3.5" />
          Connector
        </div>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Label</span>
          <Input
            value={selectedConnection.label ?? ""}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { label: event.target.value === "" ? undefined : event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Line style</span>
          <select
            aria-label="Connector style"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={selectedConnection.style ?? "solid"}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { style: event.target.value as InteractiveCanvasConnection["style"] },
              })
            }
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Arrow</span>
          <select
            aria-label="Connector arrow"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={selectedConnection.arrow ?? "forward"}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { arrow: event.target.value as InteractiveCanvasConnection["arrow"] },
              })
            }
          >
            <option value="none">None</option>
            <option value="forward">Forward</option>
            <option value="back">Back</option>
            <option value="both">Both</option>
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => dispatch({ type: "canvas.deleteSelection" })}
        >
          <TrashIcon className="h-4 w-4" />
          Delete
        </Button>
      </div>
    ) : (
      <div className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
        Select a canvas object to inspect geometry, annotations, and agent context.
      </div>
    )}

    <div className="mt-4 rounded-md border border-border/70 p-3 text-xs text-muted-foreground">
      <div className="font-medium text-foreground">Selection context</div>
      <div>{selectionContext.objects.length} selected objects</div>
      <div>{selectionContext.connections.length} nearby connectors</div>
      <div>{selectionContext.annotations.length} annotations</div>
    </div>
    </aside>
  );
}

/**
 * A size field that edits a draft: the reducer snaps sizes to the grid (and
 * floors them at 16), so applying every keystroke would turn a typed "200"
 * into 1600. The typed value applies on Enter or blur; Escape drops it.
 */
function SizeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(next) && next > 0 && next !== value) onCommit(next);
  };
  return (
    <Input
      type="number"
      aria-label={label}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}
