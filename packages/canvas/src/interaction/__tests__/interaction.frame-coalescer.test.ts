import { describe, expect, it } from "bun:test";
import { createFrameCoalescer, type FrameScheduler } from "../interaction";

/**
 * Deterministic fake scheduler (checkpoint 1, T1.1.1): captures the requested
 * callback instead of relying on a real requestAnimationFrame, so a "frame"
 * only advances when the test explicitly calls runFrame(). This lets us
 * assert the coalescer's collapse-to-latest / synchronous-flush / cancel
 * behavior without any timing flakiness.
 */
function makeFakeScheduler() {
  let nextHandle = 1;
  let pending: { handle: number; callback: () => void } | null = null;

  const scheduler: FrameScheduler = {
    request: (callback) => {
      const handle = nextHandle++;
      pending = { handle, callback };
      return handle;
    },
    cancel: (handle) => {
      if (pending?.handle === handle) pending = null;
    },
  };

  return {
    scheduler,
    /** Simulates one animation frame firing, if one is currently scheduled. */
    runFrame() {
      const current = pending;
      pending = null;
      current?.callback();
    },
    get hasPendingFrame() {
      return pending !== null;
    },
  };
}

describe("createFrameCoalescer", () => {
  it("collapses N rapid pushes within one frame into a single commit of the latest value", () => {
    const fake = makeFakeScheduler();
    const commits: number[] = [];
    const coalescer = createFrameCoalescer<number>((value) => commits.push(value), fake.scheduler);

    coalescer.push(1);
    coalescer.push(2);
    coalescer.push(3);
    coalescer.push(4);

    expect(commits).toEqual([]); // nothing commits until the frame fires
    expect(fake.hasPendingFrame).toBe(true);

    fake.runFrame();

    expect(commits).toEqual([4]); // only the latest value, exactly once
    expect(fake.hasPendingFrame).toBe(false);
  });

  it("schedules a new frame for the next batch of pushes after a commit", () => {
    const fake = makeFakeScheduler();
    const commits: number[] = [];
    const coalescer = createFrameCoalescer<number>((value) => commits.push(value), fake.scheduler);

    coalescer.push(1);
    fake.runFrame();
    coalescer.push(2);
    coalescer.push(3);
    fake.runFrame();

    expect(commits).toEqual([1, 3]);
  });

  it("flush commits synchronously and cancels the pending frame", () => {
    const fake = makeFakeScheduler();
    const commits: number[] = [];
    const coalescer = createFrameCoalescer<number>((value) => commits.push(value), fake.scheduler);

    coalescer.push(42);
    expect(fake.hasPendingFrame).toBe(true);

    coalescer.flush();

    expect(commits).toEqual([42]);
    expect(fake.hasPendingFrame).toBe(false);

    // Frame never fires afterward (it was cancelled) and produces no duplicate commit.
    fake.runFrame();
    expect(commits).toEqual([42]);
  });

  it("flush is a no-op when nothing is pending", () => {
    const fake = makeFakeScheduler();
    const commits: number[] = [];
    const coalescer = createFrameCoalescer<number>((value) => commits.push(value), fake.scheduler);

    coalescer.flush();
    expect(commits).toEqual([]);
  });

  it("cancel drops the pending value without committing", () => {
    const fake = makeFakeScheduler();
    const commits: number[] = [];
    const coalescer = createFrameCoalescer<number>((value) => commits.push(value), fake.scheduler);

    coalescer.push(7);
    coalescer.cancel();

    expect(fake.hasPendingFrame).toBe(false);
    fake.runFrame(); // no-op, nothing scheduled anymore
    expect(commits).toEqual([]);
  });

  it("exposes isPending reflecting whether a frame is currently scheduled", () => {
    const fake = makeFakeScheduler();
    const coalescer = createFrameCoalescer<number>(() => {}, fake.scheduler);

    expect(coalescer.isPending).toBe(false);
    coalescer.push(1);
    expect(coalescer.isPending).toBe(true);
    fake.runFrame();
    expect(coalescer.isPending).toBe(false);
  });
});
