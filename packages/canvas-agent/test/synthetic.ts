import type {
  InteractiveCanvasAnnotation,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

/** Hand-built synthetic documents for the scope/diff/lint unit cases. */

export function box(
  id: string,
  x: number,
  y: number,
  width = 160,
  height = 96,
  type: InteractiveCanvasObjectType = "rectangle",
): InteractiveCanvasObject {
  return { id, type, text: id, parentId: null, geometry: { x, y, width, height } };
}

export function connect(
  id: string,
  from: string,
  to: string,
): InteractiveCanvasConnection {
  return { id, from: { objectId: from }, to: { objectId: to } };
}

export function makeDocument(
  objects: InteractiveCanvasObject[],
  connections: InteractiveCanvasConnection[] = [],
): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "synthetic",
    title: "Synthetic",
    mode: "diagram",
    objects,
    connections,
  };
}

/**
 * Representative documents whose complete digest and diagnostics text
 * characterize the model-visible board surface across the R4 refactor.
 */
export function characterizationDocuments(): Array<{
  name: string;
  document: InteractiveCanvasDocument;
}> {
  const page = {
    ...box("page", 0, 0, 640, 480, "section"),
    text: "Page frame",
    locked: "background" as const,
  };
  const inner = {
    ...box("inner", 32, 64, 320, 240, "section"),
    text: "Inner",
    color: "blue" as const,
    parentId: "page",
  };
  const task = {
    ...box("task", 64, 128, 184, 96, "process"),
    text: "Do the thing",
    color: "teal" as const,
    parentId: "inner",
  };
  const sticky = {
    ...box("note", 400, 64, 160, 160, "sticky"),
    text: "Remember this",
    parentId: "page",
  };
  const edge = {
    ...connect("task-note", "task", "note"),
    label: "see",
    style: "dashed" as const,
  };

  const annotations = makeDocument(
    [box("task", 0, 0), box("other", 320, 0)],
    [connect("task-other", "task", "other")],
  );
  annotations.annotations = [
    {
      id: "comment-task",
      target: { kind: "object", objectId: "task" },
      intent: "note",
      status: "open",
      body: "Keep this as the entry point",
      createdBy: "human",
    },
    {
      id: "request-edge",
      target: { kind: "connection", connectionId: "task-other" },
      intent: "agent-request",
      status: "applied",
      body: "Make the relationship clearer",
      createdBy: "human",
    },
    {
      id: "request-region",
      target: { kind: "region", region: { x: 12, y: 34, width: 200, height: 120 } },
      intent: "agent-request",
      status: "resolved",
      body: "Use this area for outcomes",
      createdBy: "human",
    },
  ] satisfies InteractiveCanvasAnnotation[];

  // The nested locked frame deliberately precedes the root to pin root preference.
  const nestedFrame = {
    ...box("nested-frame", 32, 32, 320, 240, "section"),
    text: "Nested locked",
    locked: "background" as const,
    parentId: "page-all",
  };
  const pageAll = {
    ...box("page-all", 0, 0, 1280, 900, "section"),
    text: "All fields page",
    color: "violet" as const,
    locked: "background" as const,
  };
  const sectionAll = {
    ...box("section-all", 48, 80, 720, 560, "section"),
    text: "Nested section",
    color: "blue" as const,
    parentId: "page-all",
    locked: "all" as const,
  };
  const nodeA = {
    ...box("node-a", 96, 160, 180, 100, "process"),
    text: "First node",
    color: "teal" as const,
    parentId: "section-all",
  };
  const nodeB = {
    ...box("node-b", 480, 400, 190, 110, "decision"),
    text: "Second node",
    color: "orange" as const,
    parentId: "section-all",
  };
  const stickyAll = {
    ...box("sticky-all", 820, 100, 180, 180, "sticky"),
    text: "Sticky text",
    color: "yellow" as const,
    parentId: "page-all",
  };
  const markerAll = {
    ...box("marker-all", 1040, 120, 32, 32, "annotation-marker"),
    text: "Marker",
    color: "red" as const,
    parentId: "page-all",
  };
  const comprehensive = makeDocument(
    [nestedFrame, pageAll, sectionAll, nodeA, nodeB, stickyAll, markerAll],
    [
      {
        ...connect("edge-forward", "node-a", "node-b"),
        label: "forward label",
        arrow: "forward",
        color: "blue",
      },
      {
        ...connect("edge-none", "node-a", "node-b"),
        label: "none label",
        style: "dashed",
        arrow: "none",
        color: "red",
      },
      {
        ...connect("edge-back", "node-b", "node-a"),
        label: "back label",
        arrow: "back",
        waypoints: [[400, 300], [320, 280]],
      },
      {
        ...connect("edge-both", "node-b", "node-a"),
        arrow: "both",
      },
    ],
  );
  comprehensive.annotations = [
    {
      id: "all-object",
      target: { kind: "object", objectId: "node-a" },
      intent: "note",
      status: "open",
      body: "Object annotation",
      createdBy: "human",
    },
    {
      id: "all-connection",
      target: { kind: "connection", connectionId: "edge-none" },
      intent: "agent-request",
      status: "applied",
      body: "Connection request",
      createdBy: "human",
    },
    {
      id: "all-region",
      target: { kind: "region", region: { x: 800.4, y: 400.6, width: 240.2, height: 180.8 } },
      intent: "agent-request",
      status: "resolved",
      body: "Region request",
      createdBy: "human",
    },
  ] satisfies InteractiveCanvasAnnotation[];

  return [
    { name: "digest-rich", document: makeDocument([page, inner, task, sticky], [edge]) },
    { name: "digest-annotations", document: annotations },
    { name: "digest-frameless", document: makeDocument([box("only", 0, 0)]) },
    {
      name: "digest-solo-section",
      document: makeDocument([{ ...box("solo", 0, 0, 480, 320, "section"), text: "Solo" }]),
    },
    {
      name: "digest-clipping",
      document: makeDocument([{
        ...box("wordy", 0, 0),
        text: `multi\nline ${"x".repeat(200)}`,
      }]),
    },
    {
      name: "perception-labeled-gap",
      document: makeDocument(
        [box("alpha", 0, 0), box("beta", 208, 0)],
        [{ ...connect("edge", "alpha", "beta"), label: "go" }],
      ),
    },
    { name: "perception-single", document: makeDocument([box("alpha", 0, 0)]) },
    {
      name: "perception-object-delta",
      document: makeDocument([
        box("alpha", 0, 0),
        box("beta", 320, 0),
        box("gamma", 640, 0),
      ]),
    },
    {
      name: "perception-membership",
      document: makeDocument([
        box("section-a", 0, 0, 400, 320, "section"),
        box("section-b", 500, 0, 400, 320, "section"),
        { ...box("child", 80, 112), parentId: "section-a" },
      ]),
    },
    {
      name: "perception-connections",
      document: makeDocument(
        [box("alpha", 0, 0), box("beta", 480, 0), box("gamma", 960, 0)],
        [
          { ...connect("alpha-beta", "alpha", "beta"), label: "before" },
          connect("beta-gamma", "beta", "gamma"),
        ],
      ),
    },
    {
      name: "perception-clean-pair",
      document: makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]),
    },
    {
      name: "perception-two-overlaps",
      document: makeDocument([
        box("a1", 0, 0),
        box("a2", 40, 0),
        box("b1", 2000, 0),
        box("b2", 2040, 0),
      ]),
    },
    {
      name: "perception-quickfix",
      document: makeDocument(
        [box("alpha", 0, 0), box("beta", 204, 0)],
        [{ ...connect("edge", "alpha", "beta"), label: "X" }],
      ),
    },
    { name: "comprehensive-all-blocks", document: comprehensive },
  ];
}
