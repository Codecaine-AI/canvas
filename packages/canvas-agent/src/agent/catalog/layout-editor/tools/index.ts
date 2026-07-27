/**
 * The layout-editor's action surface — exactly eighteen private tools.
 *
 * The folder is the roster; this file only composes it, in the order the model
 * meets the tools:
 *
 *   ./apply-operation.ts     the thirteen typed mutators (one tool each)
 *   ./look.ts                whole-board perception, changes nothing
 *   ./update-description.ts  rewrite the board's standing account
 *   ./add-annotation.ts      open a question thread on one object
 *   ./resolve-request.ts     dispose one entry of the request queue
 *   ./finalize.ts            end the run, with or without a proposal
 *
 * Every tool declares itself here and does its work in the harness session
 * store, bound through the kernel config's `toolRuntime` slot at spawn time
 * (./runtime.ts).
 */
import { defineTools } from "@agent-kernel/kernel/agent-definition";

import { registerAddAnnotation } from "./add-annotation";
import { registerApplyOperation } from "./apply-operation";
import { registerFinalize } from "./finalize";
import { registerLook } from "./look";
import { registerResolveRequest } from "./resolve-request";
import { registerUpdateDescription } from "./update-description";
import type { LayoutToolRuntime, ToolRegistration } from "./runtime";

export type { ToolRegistration, ToolRegistrar } from "./runtime";

/** The roster, in registration order. */
const REGISTRATIONS: readonly ToolRegistration[] = [
  registerApplyOperation,
  registerLook,
  registerUpdateDescription,
  registerAddAnnotation,
  registerResolveRequest,
  registerFinalize,
];

export const tools = defineTools<LayoutToolRuntime>((pi, runtime) => {
  for (const register of REGISTRATIONS) register(pi, runtime);
});

export default tools;
