"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "../../../ui/icons";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { Textarea } from "../../../ui/textarea";
import {
  buildSelectionContext,
  type CanvasAction,
  type CanvasChangeSummary,
} from "../../../state/actions";
import { CANVAS_PALETTE_TOKENS, paletteTokenStyle } from "../../../theme";
import type {
  CanvasPaletteToken,
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "../../../state/schema";

export interface InspectorProps {
  lastChange: CanvasChangeSummary | undefined;
  selectedObject: InteractiveCanvasObject | undefined;
  selectedConnection: InteractiveCanvasConnection | undefined;
  selectionContext: ReturnType<typeof buildSelectionContext>;
  dispatch: (action: CanvasAction) => void;
  applyPaletteTokenToSelection: (token: CanvasPaletteToken | undefined) => void;
}

export function Inspector({
  lastChange,
  selectedObject,
  selectedConnection,
  selectionContext,
  dispatch,
  applyPaletteTokenToSelection,
}: InspectorProps) {
  const [annotationBody, setAnnotationBody] = useState("");

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
    <aside className="absolute bottom-24 right-4 top-20 z-20 w-[320px] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur">
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
          <span className="text-muted-foreground">Label</span>
          <Input
            value={selectedObject.label}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateObject",
                objectId: selectedObject.id,
                patch: { label: event.target.value },
              })
            }
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Body</span>
          <Textarea
            value={selectedObject.body ?? ""}
            onChange={(event) =>
              dispatch({
                type: "canvas.updateObject",
                objectId: selectedObject.id,
                patch: { body: event.target.value },
              })
            }
          />
        </label>
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
          <Input
            type="number"
            aria-label="Object width"
            value={selectedObject.geometry.width}
            onChange={(event) =>
              dispatch({
                type: "canvas.resizeObject",
                objectId: selectedObject.id,
                width: Number(event.target.value),
                height: selectedObject.geometry.height,
              })
            }
          />
          <Input
            type="number"
            aria-label="Object height"
            value={selectedObject.geometry.height}
            onChange={(event) =>
              dispatch({
                type: "canvas.resizeObject",
                objectId: selectedObject.id,
                width: selectedObject.geometry.width,
                height: Number(event.target.value),
              })
            }
          />
        </div>
        <div className="grid gap-1.5 text-xs">
          <span className="text-muted-foreground">Color</span>
          <div className="flex flex-wrap gap-1.5">
            {CANVAS_PALETTE_TOKENS.map(({ token, label, description }) => (
              <button
                key={token}
                type="button"
                title={description}
                aria-label={`Set color: ${label}`}
                aria-pressed={selectedObject.style?.paletteToken === token}
                data-canvas-palette-swatch={token}
                data-selected={selectedObject.style?.paletteToken === token ? "true" : undefined}
                className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: paletteTokenStyle(token).accent,
                  borderColor:
                    selectedObject.style?.paletteToken === token
                      ? "var(--foreground)"
                      : "transparent",
                }}
                onClick={() => applyPaletteTokenToSelection(token)}
              />
            ))}
            <button
              type="button"
              title="Clear semantic color — fall back to the object's tone"
              aria-label="Set color: none"
              aria-pressed={!selectedObject.style?.paletteToken}
              data-canvas-palette-swatch="none"
              data-selected={!selectedObject.style?.paletteToken ? "true" : undefined}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
              style={{
                borderColor: !selectedObject.style?.paletteToken
                  ? "var(--foreground)"
                  : "var(--border)",
              }}
              onClick={() => applyPaletteTokenToSelection(undefined)}
            >
              <XIcon className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
        {selectedObject.type === "section" && (
          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() =>
              dispatch({
                type: "canvas.fitSectionToChildren",
                sectionId: selectedObject.id,
              })
            }
          >
            <CheckIcon className="h-4 w-4" />
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
          <span className="text-muted-foreground">Style</span>
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
            <option value="dotted">Dotted</option>
            <option value="elbow">Elbow</option>
            <option value="smooth">Smooth</option>
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
