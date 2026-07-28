/**
 * Shared construction for the workflow tools — the non-gesture calls (`look`,
 * the description/title/annotation family, `finalize`). A descriptor binds the
 * model-facing declaration (name, label, description, sealed parameters) to a
 * dispatch into the layout tool runtime; implementations live beside their
 * descriptors, one file per tool.
 */
import { Type, type Static, type TSchema } from "@mariozechner/pi-ai";

import type { LayoutToolRenderResult, LayoutToolRuntime } from "../runtime";

type WorkflowFields = Record<string, TSchema>;

/**
 * Decode the tool's Type.Object shape without importing TypeBox's TObject or
 * TProperties helpers, which pi-ai does not re-export.
 */
type FieldParams<TFields extends WorkflowFields> =
  Static<ReturnType<typeof Type.Object<TFields>>>;

export interface WorkflowTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  readonly executionMode: "sequential";
  /** Set only on the run-ending tool: a successful result terminates the run. */
  readonly terminate?: boolean;
  invoke(
    runtime: LayoutToolRuntime,
    params: Record<string, unknown>,
  ): Promise<LayoutToolRenderResult>;
}

/** The tool-specific portion of a workflow tool. */
export interface WorkflowSpec<TFields extends WorkflowFields> {
  /** Tool name, snake_case, matching the gesture roster's convention. */
  name: string;
  label: string;
  description: string;
  /** The tool's parameters, in full: its wire schema is exactly these. */
  fields: TFields;
  /** Set only on the run-ending tool. */
  terminate?: boolean;
  /** Dispatch into the matching runtime method. */
  invoke(
    runtime: LayoutToolRuntime,
    params: FieldParams<TFields>,
  ): Promise<LayoutToolRenderResult>;
}

/**
 * Define one workflow tool.
 *
 * The wire schema is exactly `spec.fields`, sealed: the tool carries its own
 * arguments and nothing else, and a key it does not declare is rejected rather
 * than silently dropped.
 */
export function defineWorkflowTool<TFields extends WorkflowFields>(
  spec: WorkflowSpec<TFields>,
): WorkflowTool {
  return {
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: Type.Object({ ...spec.fields }, { additionalProperties: false }),
    executionMode: "sequential",
    terminate: spec.terminate,
    invoke: (runtime, params) =>
      spec.invoke(runtime, params as FieldParams<TFields>),
  };
}
