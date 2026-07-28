import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { isDeepStrictEqual } from "node:util";

import type { InteractiveCanvasDocument } from "../../../canvas/src/state/schema.ts";
import { applyProposalOperations } from "../src/scenario/harness.ts";
import {
  boardIdFor,
  createInitialDocument,
  discoverScenarios,
} from "../src/scenario/scenario.ts";
import {
  runStubQueue,
  type SuiteQueueStatus,
} from "../src/scenario/queue.ts";
import { parseSuiteArgs } from "../src/scenario/suite.ts";
import {
  createStatusDisplay,
  renderStatusFrame,
} from "../src/scenario/status_display.ts";

if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
  throw new Error("Usage: bun scripts/smoke_scenarios.ts --dry-run");
}

const defaultSystemArgs = parseSuiteArgs([
  "--run-id",
  "2026-07-23-thinking-system",
]);
assert.equal(defaultSystemArgs.sutThinking, "low");
assert.equal(defaultSystemArgs.sutThinkingSource, "eval default");
assert.equal(defaultSystemArgs.toolCallCap, 3);
assert.equal(defaultSystemArgs.toolCallCapSource, "agent default");
const overriddenThinkingArgs = parseSuiteArgs([
  "--run-id",
  "2026-07-23-thinking-override",
  "--sut-thinking",
  "high",
]);
assert.equal(overriddenThinkingArgs.sutThinking, "high");
assert.equal(overriddenThinkingArgs.sutThinkingSource, "--sut-thinking");
assert.throws(
  () =>
    parseSuiteArgs([
      "--run-id",
      "2026-07-23-thinking-invalid",
      "--sut-thinking",
      "turbo",
    ]),
  /Unsupported SUT thinking level/,
);
for (const cap of ["1", "2", "3"] as const) {
  const overriddenCapArgs = parseSuiteArgs([
    "--run-id",
    `2026-07-23-tool-call-cap-${cap}`,
    "--tool-call-cap",
    cap,
  ]);
  assert.equal(overriddenCapArgs.toolCallCap, Number(cap));
  assert.equal(overriddenCapArgs.toolCallCapSource, "--tool-call-cap");
}
for (const cap of ["0", "4", "two", "01", "1.0"]) {
  assert.throws(
    () =>
      parseSuiteArgs([
        "--run-id",
        "2026-07-23-tool-call-cap-invalid",
        "--tool-call-cap",
        cap,
      ]),
    /--tool-call-cap must be 1, 2, or 3\./,
  );
}

const proposalDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "smoke-proposal",
  mode: "diagram",
  objects: [
    {
      id: "object-1",
      type: "process",
      text: "Before",
      geometry: { x: 0, y: 0, width: 96, height: 64 },
    },
  ],
  connections: [],
};
const proposalResult = applyProposalOperations(
  proposalDocument,
  [{ type: "updateObject", objectId: "object-1", patch: { text: "After" } }],
  "Smoke canonicalization",
);
assert.ok(
  isDeepStrictEqual(proposalResult, JSON.parse(JSON.stringify(proposalResult))),
);

const systemScenarios = await discoverScenarios();
assert.equal(systemScenarios.length, 8);
assert.equal(
  systemScenarios.reduce((total, scenario) => total + scenario.stages.length, 0),
  10,
);
assert.deepEqual(
  Object.fromEntries(
    [1, 2, 3, 4, 5].map((complexity) => [
      complexity,
      systemScenarios.filter((scenario) => scenario.complexity === complexity).length,
    ]),
  ),
  { 1: 1, 2: 2, 3: 2, 4: 2, 5: 1 },
);
assert.equal(
  systemScenarios.filter((scenario) => scenario.declaredEditCount > 0).length,
  2,
);

for (const scenario of systemScenarios) {
  assert.equal(scenario.tier, "system");
  assert.ok(scenario.stages.every((stage) => stage.instruction.trim().length > 0));
  assert.ok(scenario.stages.every((stage) => stage.scopeDescription === null));
  assert.equal(
    scenario.stages[0]?.instruction,
    await readFile(scenario.sourcePath, "utf8"),
  );
  const boardId = boardIdFor("2026-07-23-Smoke", scenario.scenario);
  assert.equal(boardId, `eval.2026-07-23-smoke.${scenario.scenario}`);
  const initial = createInitialDocument(
    scenario,
    "2026-07-23-smoke",
    boardId,
  );
  assert.deepEqual(initial.objects.map((object) => object.id), ["page-frame"]);
  console.log(
    `system/${scenario.scenario} (complexity ${scenario.complexity}): ${
      scenario.stages.map((stage) => stage.id).join(" → ")
    }`,
  );
}

let maximumActive = 0;
let activeChildren = 0;
const events = await runStubQueue(systemScenarios, 3, (event) => {
  if (event.event === "start") {
    activeChildren += 1;
    maximumActive = Math.max(maximumActive, activeChildren);
  } else if (event.event === "exit") {
    activeChildren -= 1;
  }
});
assert.equal(activeChildren, 0);
for (const scenario of systemScenarios) {
  assert.deepEqual(
    events
      .filter((event) => event.scenario === scenario.scenario)
      .map((event) => event.event),
    ["start", "exit", "judge", "graded"],
  );
}

assert.ok(maximumActive <= 3);

const statusScenario = systemScenarios.find((scenario) =>
  scenario.scenario === "llm-inference-gateway"
);
assert.ok(statusScenario);
const pipedStatus = new PassThrough();
pipedStatus.setEncoding("utf8");
let nonTtyStatusOutput = "";
pipedStatus.on("data", (chunk: string) => {
  nonTtyStatusOutput += chunk;
});
const statusDisplay = createStatusDisplay({
  output: pipedStatus,
  scorecardPath: "/tmp/eval-suite-stub-scorecard.md",
  registerSignalHandlers: false,
});
assert.equal(statusDisplay.isTTY, false);
const statusSnapshots: SuiteQueueStatus[] = [];
await runStubQueue(
  [statusScenario],
  1,
  undefined,
  {
    onStatus(status) {
      statusSnapshots.push(status);
      statusDisplay.onStatus(status);
    },
  },
);
statusDisplay.finish();
await new Promise<void>((resolveEnd) => pipedStatus.end(resolveEnd));

assert.doesNotMatch(nonTtyStatusOutput, /\u001b\[/);
assert.match(
  nonTtyStatusOutput,
  /^\d{4}-\d{2}-\d{2}T\S+ llm-inference-gateway queued$/m,
);
assert.match(
  nonTtyStatusOutput,
  /^\d{4}-\d{2}-\d{2}T\S+ llm-inference-gateway building e1 \(2\/2\)$/m,
);
assert.match(
  nonTtyStatusOutput,
  /^\d{4}-\d{2}-\d{2}T\S+ llm-inference-gateway judging \(5\/5 axes done\)$/m,
);
assert.match(
  nonTtyStatusOutput,
  /^\d{4}-\d{2}-\d{2}T\S+ llm-inference-gateway graded$/m,
);
assert.match(
  nonTtyStatusOutput,
  /summary: scenarios 1 graded \/ 0 failed · wall \d+:\d{2} · scorecard \/tmp\/eval-suite-stub-scorecard\.md/,
);

const buildingE1 = statusSnapshots.find((status) =>
  status.scenarios.some((scenario) =>
    scenario.scenario === "llm-inference-gateway"
    && scenario.status === "building"
    && scenario.currentStage === "e1"
    && scenario.sessionNumber === 2
  )
);
assert.ok(buildingE1);
const ttyFrame = renderStatusFrame(buildingE1, Date.now());
assert.match(
  ttyFrame,
  /eval suite 2026-07-23-stub · elapsed \d+:\d{2}/,
);
assert.match(ttyFrame, /services file-api up · harness up/);
assert.match(
  ttyFrame,
  /llm-inference-gateway .*building e1 \(2\/2 sessions\)/,
);
assert.match(ttyFrame, /judge semaphore 0\/1 · completed 0\/1/);

console.log(
  `dry-run smoke passed: ${systemScenarios.length} system scenarios / 10 sessions; stub parallelism ${maximumActive}`,
);
