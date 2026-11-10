/**
 * Shared construction for the workflow tools — the non-gesture calls (`look`,
 * `describe_board`, the annotation-thread family, `finalize`). A descriptor binds the
 * model-facing declaration (name, label, description, sealed parameters) to a
 * dispatch into the layout tool runtime; implementations live beside their
 * descriptors, one file per tool.
 */
import { Type, type Static, type TSchema } from "@mariozechner/pi-ai";

import type { LayoutToolRenderResult, LayoutToolRuntime } from "../runtime";

type WorkflowFields = Record<string, TSchema>;

/**
 * An optional string field where null counts as absent, so a client that
 * sends every key with null for the unused ones still sends one meaning.
 *
 * The schema is the JSON type pair `["string", "null"]`, not a TypeBox union:
 * pi-ai's `validateToolArguments` runs `Value.Convert` before it checks, and
 * Convert rewrites a `[String, Null]` union's null to "" and a
 * `[Null, String]` union's "" to null. Either would change what the call
 * means, so a null would be refused as an empty string, or an empty string
 * would pass as absent. The type pair reaches the tool exactly as sent.
 */
export function nullableString(description: string) {
  return Type.Optional(Type.Unsafe<string | null>({ type: ["string", "null"], description }));
}

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
