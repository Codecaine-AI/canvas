import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  buildServiceIdentity,
  loopbackOrigin,
  pickEphemeralPort,
  toolCallCapOverrideEnv,
  writeServiceIdentity,
  type SourceFingerprints,
} from "./queue.ts";
import {
  EVAL_FILE_API_ORIGIN_ENV,
  EVAL_HARNESS_ORIGIN_ENV,
  evalFileApiOrigin,
  evalHarnessOrigin,
  requireServiceOrigin,
} from "./harness.ts";

// These tests never bind a fixed eval port and never spawn a service: every
// port they touch comes from the kernel's ephemeral range, so they are safe to
// run while a suite run is in flight.

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), "eval-queue-test-"));
  tempDirs.push(dir);
  return dir;
}

function listen(port: number): Promise<() => Promise<void>> {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer();
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port }, () => {
      resolveListen(
        () => new Promise<void>((closed) => server.close(() => closed())),
      );
    });
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("pickEphemeralPort", () => {
  test("returns a usable high port", async () => {
    const port = await pickEphemeralPort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1_023);
    expect(port).toBeLessThan(65_536);
    const close = await listen(port);
    await close();
  });

  test("never hands out a fixed eval port", async () => {
    const ports = await Promise.all(
      Array.from({ length: 8 }, () => pickEphemeralPort()),
    );
    expect(ports).not.toContain(4821);
    expect(ports).not.toContain(4010);
    expect(ports).not.toContain(4820);
  });

  test("does not reserve the port it reports", async () => {
    // The probe socket is released, so the caller can bind the port itself.
    const port = await pickEphemeralPort();
    const close = await listen(port);
    await close();
    const second = await listen(port);
    await second();
  });

  test("concurrent picks are distinct, so runs can overlap", async () => {
    const ports = await Promise.all(
      Array.from({ length: 16 }, () => pickEphemeralPort()),
    );
    expect(new Set(ports).size).toBe(ports.length);
  });
});

describe("loopbackOrigin", () => {
  test("addresses loopback only", () => {
    expect(loopbackOrigin(51234)).toBe("http://127.0.0.1:51234");
  });
});

describe("toolCallCapOverrideEnv", () => {
  test("leaves the harness environment untouched for the agent default", () => {
    expect(toolCallCapOverrideEnv(3, "agent default")).toEqual({});
  });

  test("sets the explicit cap as an environment string", () => {
    expect(toolCallCapOverrideEnv(1, "--tool-call-cap")).toEqual({
      CANVAS_AGENT_TOOL_CALL_CAP: "1",
    });
  });
});

function fingerprints(): SourceFingerprints {
  return {
    prompt: { hash: "aaaa1111", files: ["prompt.json"] },
    lints: { hash: "bbbb2222", files: ["lints/a.ts"] },
    styles: { hash: "cccc3333", files: ["style-guide/a.md"] },
    surface: { hash: "dddd4444", files: ["tools/a.ts"] },
  };
}

describe("buildServiceIdentity", () => {
  test("records pid, port, origin, git and source hashes", () => {
    const identity = buildServiceIdentity({
      runId: "2026-07-28-example",
      git: { revision: "abc1234", dirty: true },
      fingerprints: fingerprints(),
      now: new Date("2026-07-28T12:00:00.000Z"),
      services: [
        {
          name: "eval harness",
          pid: 4242,
          port: 51234,
          origin: "http://127.0.0.1:51234",
          startedAt: "2026-07-28T11:59:00.000Z",
          healthCheckedAt: "2026-07-28T11:59:30.000Z",
          logPath: "/nowhere/services/harness.log",
        },
      ],
    });

    expect(identity.run_id).toBe("2026-07-28-example");
    expect(identity.written_at).toBe("2026-07-28T12:00:00.000Z");
    expect(identity.git).toEqual({ revision: "abc1234", dirty: true });
    expect(identity.hashes).toEqual({
      prompt: "aaaa1111",
      lint: "bbbb2222",
      style: "cccc3333",
      surface: "dddd4444",
    });
    expect(identity.services).toHaveLength(1);
    const [harness] = identity.services;
    expect(harness.name).toBe("eval harness");
    expect(harness.pid).toBe(4242);
    expect(harness.port).toBe(51234);
    expect(harness.origin).toBe("http://127.0.0.1:51234");
    expect(harness.started_at).toBe("2026-07-28T11:59:00.000Z");
    expect(harness.health_checked_at).toBe("2026-07-28T11:59:30.000Z");
  });

  test("keeps a null log path null", () => {
    const identity = buildServiceIdentity({
      runId: "2026-07-28-example",
      git: { revision: "abc1234", dirty: false },
      fingerprints: fingerprints(),
      services: [
        {
          name: "eval file API",
          pid: null,
          port: null,
          origin: null,
          startedAt: null,
          healthCheckedAt: "2026-07-28T11:59:30.000Z",
          logPath: null,
        },
      ],
    });
    expect(identity.services[0].log).toBeNull();
  });
});

describe("writeServiceIdentity", () => {
  test("writes identity.json into a services directory it creates", async () => {
    const servicesDir = resolve(await tempDir(), "services");
    const identity = buildServiceIdentity({
      runId: "2026-07-28-example",
      git: { revision: "abc1234", dirty: false },
      fingerprints: fingerprints(),
      now: new Date("2026-07-28T12:00:00.000Z"),
      services: [
        {
          name: "eval harness",
          pid: 4242,
          port: 51234,
          origin: "http://127.0.0.1:51234",
          startedAt: "2026-07-28T11:59:00.000Z",
          healthCheckedAt: "2026-07-28T11:59:30.000Z",
          logPath: null,
        },
      ],
    });

    const path = await writeServiceIdentity({ servicesDir, identity });
    expect(path).toBe(resolve(servicesDir, "identity.json"));
    const source = await readFile(path, "utf8");
    expect(source.endsWith("\n")).toBe(true);
    expect(JSON.parse(source)).toEqual(identity);
  });

  test("a rewrite replaces the previous record", async () => {
    const servicesDir = resolve(await tempDir(), "services");
    const base = {
      runId: "2026-07-28-example",
      git: { revision: "abc1234", dirty: false },
      fingerprints: fingerprints(),
      services: [],
    };
    await writeServiceIdentity({
      servicesDir,
      identity: buildServiceIdentity({ ...base, now: new Date(0) }),
    });
    const second = buildServiceIdentity({ ...base, now: new Date(1_000) });
    await writeServiceIdentity({ servicesDir, identity: second });
    const parsed = JSON.parse(
      await readFile(resolve(servicesDir, "identity.json"), "utf8"),
    ) as { written_at: string };
    expect(parsed.written_at).toBe(second.written_at);
  });
});

describe("service origins from the environment", () => {
  test("normalizes a configured origin", () => {
    expect(
      requireServiceOrigin("X_ORIGIN", { X_ORIGIN: "http://127.0.0.1:51234/" }),
    ).toBe("http://127.0.0.1:51234");
  });

  test("reads each service from its own variable", () => {
    const env = {
      [EVAL_FILE_API_ORIGIN_ENV]: "http://127.0.0.1:51000",
      [EVAL_HARNESS_ORIGIN_ENV]: "http://127.0.0.1:51001",
    };
    expect(evalFileApiOrigin(env)).toBe("http://127.0.0.1:51000");
    expect(evalHarnessOrigin(env)).toBe("http://127.0.0.1:51001");
  });

  test("refuses to guess when the origin is missing", () => {
    expect(() => evalHarnessOrigin({})).toThrow(EVAL_HARNESS_ORIGIN_ENV);
    expect(() => evalFileApiOrigin({ [EVAL_FILE_API_ORIGIN_ENV]: "  " }))
      .toThrow(EVAL_FILE_API_ORIGIN_ENV);
  });

  test("rejects a non-http origin", () => {
    expect(() => requireServiceOrigin("X_ORIGIN", { X_ORIGIN: "nope" })).toThrow(
      "not a valid URL",
    );
    expect(() =>
      requireServiceOrigin("X_ORIGIN", { X_ORIGIN: "ftp://127.0.0.1:9" })
    ).toThrow("http(s) origin");
  });
});
