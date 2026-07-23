/**
 * Private tool sidecar for the layout-editor agent — the layout tools of
 * KERNEL-PROPOSAL §2.2, registered per-agent through defineTools. The actual
 * work lives in the harness session store; the kernel binds it here through
 * the config `toolRuntime` slot at spawn time.
 */
import { defineTools } from "@agent-kernel/kernel/agent-definition";
import { Type } from "@mariozechner/pi-ai";

import type { AgentPatchOperation } from "../../../protocol";
import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "../../tool-runtime";

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
  if ("png" in result && result.png) {
    content.push({ type: "image", data: result.png.toString("base64"), mimeType: "image/png" });
  }
  return {
    content,
    details: result.details ?? {},
    isError: result.isError === true,
    ...(terminate && !result.isError ? { terminate: true } : {}),
  };
}

export const tools = defineTools<LayoutToolRuntime>((pi, runtime) => {
  pi.registerTool({
    name: "board",
    label: "Board digest",
    description: [
      "The board digest for the current draft: sections (nested), nodes, edges, and stickies with ids, colors, text, and geometry — the structural facts — plus the current diagnostics.",
      "Diagnostics are tiered: E* errors block commit and must be fixed; W* warnings are yours to judge — fix them, apply_quickfix them (when marked [quickfix]), or consciously override and name them in your commit summary.",
      "Call this whenever you need a fresh full structural view; apply_ops/apply_quickfix results carry only what changed (a DELTA block, a LINTS delta, and a close-up image of the touched region). The first call includes the house-style reference board image.",
    ].join("\n"),
    parameters: Type.Object({}),
    executionMode: "sequential",
    execute: async () => toToolResult(requireRuntime(runtime).board()),
  });

  pi.registerTool({
    name: "fit_scope",
    label: "Fit scope",
    description:
      "Legacy program view — prefer the board tool for your structural read. Fits the scoped part of the board into a layout program: the program text, the legend (program number ↔ object id/type/full text/size), and the boundary report (frame rect, arrows crossing the scope edge, nearest outside neighbors). Only needed if you intend to use propose_program.",
    parameters: Type.Object({}),
    executionMode: "sequential",
    execute: async () => toToolResult(requireRuntime(runtime).fitScope()),
  });

  pi.registerTool({
    name: "apply_ops",
    label: "Apply operations",
    description: [
      "Apply id-addressed edits directly to the current draft as one atomic batch. Operation cheat-sheet (one example per kind):",
      "addObject: {type:\"addObject\",object:{id:\"new\",type:\"rectangle\",geometry:{x:0,y:0,width:160,height:80},text:\"Step\",color:\"blue\"}}",
      "updateObject: {type:\"updateObject\",objectId:\"obj-1\",patch:{text:\"Revised\",color:\"teal\"}}",
      "removeObject: {type:\"removeObject\",objectId:\"obj-1\"}",
      "addConnection: {type:\"addConnection\",connection:{id:\"edge-1\",from:{objectId:\"obj-1\"},to:{objectId:\"obj-2\"},label:\"next\",style:\"solid\",color:\"gray\"}}",
      "updateConnection: {type:\"updateConnection\",connectionId:\"edge-1\",patch:{label:\"retry\",style:\"dashed\",color:\"red\"}}",
      "removeConnection: {type:\"removeConnection\",connectionId:\"edge-1\"}",
      "addAnnotation: {type:\"addAnnotation\",annotation:{id:\"note-1\",intent:\"note\",body:\"Check this\",target:{kind:\"object\",objectId:\"obj-1\"},status:\"open\",createdBy:\"agent\"}}",
      "removeAnnotation: {type:\"removeAnnotation\",annotationId:\"note-1\"}",
      "fitSectionToChildren: {type:\"fitSectionToChildren\",sectionId:\"section-1\",padding:32}",
      "Connection endpoints from/to have shape { objectId: string }. Allowed colors: gray, red, orange, yellow, green, teal, blue, violet, pink, white.",
      "The result shows what actually changed: a DELTA block (id  old → new, derived from the documents, so parentId reconciliation shows up), a LINTS delta (+new/−resolved; the first apply lists everything), and a close-up image of the touched region when geometry changed.",
    ].join("\n"),
    parameters: Type.Object({
      ops: Type.Array(Type.Any(), {
        description: "The ordered operation batch. The entire batch is rejected if any operation is invalid.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).applyOps(params.ops as AgentPatchOperation[])),
  });

  pi.registerTool({
    name: "apply_quickfix",
    label: "Apply diagnostic quickfix",
    description:
      "Apply the deterministic fix a diagnostic offers (diagnostics marked [quickfix] in the board/apply_ops results). The fix runs through the same validated operation path as apply_ops and you own the result — check the returned DELTA, LINTS delta, and close-up to judge it. Errors if the id is stale or the diagnostic has no quickfix.",
    parameters: Type.Object({
      diagnosticId: Type.String({
        description: "A diagnostic id from the LATEST board or apply_ops result, e.g. \"W2\". Ids reset whenever the draft changes.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).applyQuickfix(params.diagnosticId)),
  });

  pi.registerTool({
    name: "solve_layout",
    label: "Solve selection layout",
    description:
      "Selection-scoped layout solver — rarely needed; the board is yours to place directly with apply_ops. Mode A (no program): returns the selected draft objects as program + legend text. Mode B (program provided): solves and applies geometry for the selection only; it never deletes objects, reports selected ids it did not place, and ignores arrow statements because connections are edited via apply_ops.",
    parameters: Type.Object({
      objectIds: Type.Array(Type.String(), {
        description: "Draft object ids forming the selection to fit or solve.",
      }),
      program: Type.Optional(Type.String({
        description: "Optional selection-only layout program. Omit it to get a fitted program and legend.",
      })),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).solveLayout(params.objectIds, params.program)),
  });

  pi.registerTool({
    name: "propose_program",
    label: "Propose program",
    description:
      "Propose the WHOLE rewritten layout program — rarely needed; the board is yours to place directly with apply_ops. Whole-scope re-solve; prefer solve_layout for a subset; omission deletes — verify every legend number. On parse failure you get the errors verbatim with line numbers. On success the program is solved into a new draft and you get the delta report (what moved/was created/was DELETED) plus the lint report (spacing ladder, overlaps/overflow, connector crossings).",
    parameters: Type.Object({
      program: Type.String({ description: "The complete program text (every statement, not a diff)." }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).proposeProgram(params.program)),
  });

  pi.registerTool({
    name: "render_draft",
    label: "Render draft",
    description:
      "Render the current draft to an image (scope frame plus a 128px context ring by default; pass a world-space crop for a close-up). Render after every geometry change, starting with the first solve. Use it when the reports leave a judgment call open, and always before committing.",
    parameters: Type.Object({
      crop: Type.Optional(Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        width: Type.Number(),
        height: Type.Number(),
      }, { description: "Optional world-space crop rect." })),
      pixelWidth: Type.Optional(Type.Number({ description: "Raster width in px (default 2000, max 4096). Go big — legibility beats token thrift." })),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).renderDraft({
        crop: params.crop,
        pixelWidth: params.pixelWidth,
      })),
  });

  pi.registerTool({
    name: "inspect",
    label: "Inspect objects",
    description:
      "Exact geometry and full text for the given object ids, plus an ASCII occupancy map of the scope area with a legend — the cheap way to check positions without rendering.",
    parameters: Type.Object({
      objectIds: Type.Array(Type.String(), { description: "Object ids to inspect (draft ids or quoted outside ids)." }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).inspect(params.objectIds)),
  });

  pi.registerTool({
    name: "commit",
    label: "Commit proposal",
    description:
      "Commit the current draft as the session's proposal for operator review, with a one-line summary of what you did. The summary must name any flaw you saw and shipped. This ends your run.",
    parameters: Type.Object({
      summary: Type.String({ description: "One line, plain language, e.g. \"Lined up the three steps and evened the gaps to 64px.\"" }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).commit(params.summary), true),
  });

  pi.registerTool({
    name: "abandon",
    label: "Abandon session",
    description:
      "Give up without a proposal (the board stays untouched), with a short reason. This ends your run. Only when nothing useful can be proposed; say what op you lacked; prefer partial fulfillment.",
    parameters: Type.Object({
      reason: Type.String(),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).abandon(params.reason), true),
  });
});

export default tools;
