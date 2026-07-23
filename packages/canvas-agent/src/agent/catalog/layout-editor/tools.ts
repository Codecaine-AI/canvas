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
      "Get the full structural view of the current draft as text: an indented object tree where indentation is containment (the locked page frame, then sections, nodes, and stickies inside them), followed by one EDGES block. Every line carries id, type, quoted text, color, and geometry; set fields like locked, dir, icon, anchors, and wp appear only when present, and header-declared defaults are elided. User requests are NOT here — they live in the user_requests context block. The digest is followed by the current diagnostics.",
      "Diagnostics are tiered: E* errors in the edited scope block commit and must be fixed; W* warnings are yours to judge — fix them, apply_quickfix them (when marked [quickfix]), or consciously override and name them in your commit summary.",
      "Call this whenever you need a fresh full-board view. apply_ops and apply_quickfix return only what changed: DELTA, the current or changed lints, and a close-up for geometric changes, including added, removed, or reconnected connections. The first call may also include the house-style reference board image.",
    ].join("\n"),
    parameters: Type.Object({}),
    executionMode: "sequential",
    execute: async () => toToolResult(requireRuntime(runtime).board()),
  });

  pi.registerTool({
    name: "apply_ops",
    label: "Apply operations",
    description: [
      "Apply ordered, id-addressed edits directly to the current draft as one validated batch. Exactly six operation kinds exist (one example each):",
      "addObject: {type:\"addObject\",object:{id:\"new\",type:\"rectangle\",geometry:{x:0,y:0,width:160,height:80},text:\"Step\",color:\"blue\"}}",
      "updateObject: {type:\"updateObject\",objectId:\"obj-1\",patch:{text:\"Revised\",color:\"teal\"}}",
      "removeObject: {type:\"removeObject\",objectId:\"obj-1\"}",
      "addConnection: {type:\"addConnection\",connection:{id:\"edge-1\",from:{objectId:\"obj-1\"},to:{objectId:\"obj-2\"},label:\"next\",style:\"solid\",color:\"gray\"}}",
      "updateConnection: {type:\"updateConnection\",connectionId:\"edge-1\",patch:{label:\"retry\",style:\"dashed\",color:\"red\"}}",
      "removeConnection: {type:\"removeConnection\",connectionId:\"edge-1\"}",
      "Connection endpoints from/to require objectId and may include anchor (top, right, bottom, left, or center) and position ([x,y] fractions from 0 to 1); from/to.anchor and waypoints steer the automatic router. Allowed arrows: none, forward, back, both. Allowed colors: gray, red, orange, yellow, green, teal, blue, violet, pink, white.",
      "Place or move children inside sections; section membership is reconciled from geometry, so parentId supplied in an object add or patch is not authoritative. After the whole batch, sections whose direct child set or child geometry changed automatically fit their contents, cascading innermost-first. The locked background page frame never auto-fits, and a section explicitly resized in this batch keeps that size. Do not resize sections merely to chase their contents. Removing the locked background frame is rejected.",
      "The result reports what actually changed: DELTA is derived from the before/after documents, so reconciled parentId and automatic section-size changes appear; the first apply lists all current diagnostics and later applies show lint additions/resolutions; a close-up is included for geometric changes, including added, removed, or reconnected connections. Connection label/style/color/arrow-only updates do not include a close-up.",
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
      "Apply the deterministic fix offered by a current diagnostic marked [quickfix]. It uses the same validated batch and automatic section-fit path as apply_ops; inspect the returned DELTA, lint changes, and any close-up because you own the result. The call fails if the diagnostic id is stale, has no quickfix, or its generated operations no longer validate.",
    parameters: Type.Object({
      diagnosticId: Type.String({
        description: "A diagnostic id from the LATEST board, apply_ops, or apply_quickfix result, e.g. \"W2\". Ids reset whenever the draft changes.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).applyQuickfix(params.diagnosticId)),
  });

  pi.registerTool({
    name: "render_draft",
    label: "Render draft",
    description:
      "Render the current draft to an image. By default the crop covers the current edited scope plus a 128px context ring; pass a world-space crop for a close-up. Use it when the digest or automatic apply-result crop leaves a visual judgment open, and before committing.",
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
      "Exact geometry and full text for object ids. For connection ids, returns stored endpoints, anchors, waypoints, label, style, color, and arrow plus the automatic router's true chosen anchor sides and routed polyline, naming any non-endpoint boxes crossed — the cheap way to inspect draft details without rendering.",
    parameters: Type.Object({
      objectIds: Type.Array(Type.String(), { description: "Object or connection ids to inspect." }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).inspect(params.objectIds)),
  });

  pi.registerTool({
    name: "commit",
    label: "Commit proposal",
    description:
      "Commit the current draft as the session proposal for operator review, with a one-line summary of what you changed. Error-tier diagnostics in the edited scope block commit; warnings do not, but the summary must name any flaw you knowingly ship. A successful commit ends your run.",
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
      "End the run without committing the current draft; the live board stays untouched. In a refinement, an earlier committed proposal remains available. Use this only when no useful current-draft proposal can be made; state the blocker and prefer partial fulfillment.",
    parameters: Type.Object({
      reason: Type.String(),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).abandon(params.reason), true),
  });
});

export default tools;
