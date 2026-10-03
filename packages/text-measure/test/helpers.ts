import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));

export interface FixtureOptions {
  /** Run with the happy-dom preload (browser-ish globals, as canvas/bunfig.toml does for tests). */
  happyDom?: boolean;
  env?: Record<string, string>;
  /** Interpreter: "bun" (default) or "node". */
  runtime?: "bun" | "node";
}

/**
 * Runs test/fixtures/<name> in a fresh process, so process-wide state (the
 * Pretext binding, globals) starts clean, and parses the last stdout line as JSON.
 */
export function runFixture<T = Record<string, unknown>>(name: string, options: FixtureOptions = {}): T {
  const runtime = options.runtime ?? "bun";
  const cmd =
    runtime === "node"
      ? ["node", "--no-warnings", `${FIXTURES}${name}`]
      : [process.execPath, ...(options.happyDom ? ["--preload", `${FIXTURES}happy-dom.ts`] : []), `${FIXTURES}${name}`];
  const result = Bun.spawnSync({ cmd, cwd: PACKAGE_ROOT, env: { ...process.env, ...options.env }, stdout: "pipe", stderr: "pipe" });
  const stdout = result.stdout.toString().trim();
  if (result.exitCode !== 0) {
    throw new Error(`fixture ${name} exited ${result.exitCode}\nstdout: ${stdout}\nstderr: ${result.stderr.toString()}`);
  }
  const last = stdout.split("\n").at(-1) ?? "";
  try {
    return JSON.parse(last) as T;
  } catch {
    throw new Error(`fixture ${name} printed no JSON\nstdout: ${stdout}\nstderr: ${result.stderr.toString()}`);
  }
}

export function hasNode(): boolean {
  try {
    return Bun.spawnSync({ cmd: ["node", "--version"], stdout: "pipe", stderr: "pipe" }).exitCode === 0;
  } catch {
    return false;
  }
}
