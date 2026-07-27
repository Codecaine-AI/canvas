/**
 * Private tool sidecar for the layout-editor agent. Exactly eighteen tools:
 * thirteen typed mutators built from the shared operation specs, look,
 * update_description, add_annotation, resolve_request, and finalize. The
 * actual work lives in the harness session store; the kernel binds it here
 * through the config `toolRuntime` slot at spawn time.
 */
import { defineTools } from "@agent-kernel/kernel/agent-definition";
import { Type } from "@mariozechner/pi-ai";

import { operationTools } from "../../../service/session/operations";
import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "../../../service/tool-runtime";

function requireRuntime(runtime: LayoutToolRuntime | undefined): LayoutToolRuntime {
  if (!runtime) {
    throw new Error("canvas-agent layout tool runtime was not provided by the harness.");
  }
  return runtime;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function toToolResult(result: LayoutToolTextResult | LayoutToolRenderResult, terminate = false) {
  const content: ContentBlock[] = [{ type: "text", text: result.text }];
  if ("pngs" in result && result.pngs) {
    for (const png of result.pngs) {
      content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    }
  }
  return {
    content,
    details: result.details ?? {},
    isError: result.isError === true,
    ...(terminate && !result.isError ? { terminate: true } : {}),
  };
}

export const tools = defineTools<LayoutToolRuntime>((pi, runtime) => {
  for (const tool of operationTools) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      executionMode: tool.executionMode,
      execute: async (_toolCallId, params) =>
        toToolResult(requireRuntime(runtime).operation(
          tool.name,
          params as Record<string, unknown>,
        )),
    });
  }

  pi.registerTool({
    name: "look",
    label: "Look",
    description:
      "Step back and take in the whole board: the current digest, everything that has changed since the run began, every open lint, how each edge actually routes, the request queue, and a render of the board. Changes nothing. Name a section to get a close-up alongside the full board.",
    parameters: Type.Object({
      view: Type.Optional(Type.String({
        description: "A section id to see close up alongside the full board.",
      })),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).look(params.view)),
  });

  pi.registerTool({
    name: "update_description",
    label: "Update description",
    description:
      "Rewrite the board's standing account of what the diagram represents, its pieces, and how it reads. The description is replaced whole with this markdown; a later run reads it to orientate before editing.",
    parameters: Type.Object({
      description: Type.String({
        description: "The full replacement markdown for the board description.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).updateDescription(params.description)),
  });

  pi.registerTool({
    name: "add_annotation",
    label: "Ask about an object",
    description:
      "Anchor a question to one object as an annotation thread the user answers on their own time. Use it only where the answer would genuinely change the diagram and you cannot settle it yourself — one or two per run at most; a question on every object is noise, not care. This never waits: leave the question, proceed on your best reading, and name any open thread in the finalize message. Returns the applied line and the updated REQUESTS block.",
    parameters: Type.Object({
      objectId: Type.String({
        description: "The id of the object the question is about.",
      }),
      body: Type.String({
        description: "The question, in plain language, specific enough to answer without further context.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).addAnnotation(params.objectId, params.body)),
  });

  pi.registerTool({
    name: "resolve_request",
    label: "Resolve user request",
    description:
      "Dispose one entry of the request queue (the REQUESTS block / user_requests context). Use status \"done\" after you have answered the request by editing board content, or \"declined\" when you will not — the note says what you did or why not. The note is posted into the thread as your reply and closes it on the board, so the operator reads it there. Every user-authored request must be disposed before finalize can commit; a thread you opened yourself does not need disposing. Returns the updated REQUESTS block only; the id must name an open entry (e.g. \"R1\").",
    parameters: Type.Object({
      id: Type.String({ description: "The queue id of an open request, e.g. \"R1\"." }),
      status: Type.Union([Type.Literal("done"), Type.Literal("declined")], {
        description: "done = answered on the board; declined = consciously not doing it.",
      }),
      note: Type.String({
        description: "Required. One line for the operator: what you did, or why you declined.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).resolveRequest(
        params.id,
        params.status,
        params.note,
      )),
  });

  pi.registerTool({
    name: "finalize",
    label: "Finalize run",
    description:
      "End the run. outcome \"committed\" proposes the current draft for operator review: it is blocked (and the run continues) while error-tier diagnostics remain in the edited scope, any user request is still open, or the draft does not differ from the board — fix or dispose those first; warnings never block, but the message must name any flaw you knowingly ship. outcome \"none\" ends the run without a proposal, leaving the board untouched — the message tells the operator why; prefer partial fulfillment over an empty-handed exit. message is required for both outcomes: one plain-language line. A successful finalize ends your run.",
    parameters: Type.Object({
      outcome: Type.Union([Type.Literal("committed"), Type.Literal("none")], {
        description: "committed = propose the draft; none = end without a proposal.",
      }),
      message: Type.String({
        description: "committed: one-line summary of what you changed, e.g. \"Lined up the three steps and evened the gaps to 64px.\" none: the reason no proposal could be made.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).finalize(params.outcome, params.message), true),
  });
});

export default tools;
