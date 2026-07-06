"use client";

/**
 * Injectable scheduler shape for createFrameCoalescer — mirrors the subset of
 * window.requestAnimationFrame/cancelAnimationFrame the coalescer needs, so
 * tests can supply a deterministic fake instead of a real rAF loop.
 */
export type FrameScheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

const rafScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Handle returned by createFrameCoalescer — named so hosts can store one in a ref. */
export type FrameCoalescer<T> = {
  /** Records the latest value; schedules exactly one frame if none is pending. */
  push(value: T): void;
  /** Cancels any pending frame and synchronously commits the queued value, if any. */
  flush(): void;
  /** Cancels any pending frame WITHOUT committing. */
  cancel(): void;
  /** True while a frame is scheduled and waiting to commit. */
  readonly isPending: boolean;
};

/**
 * Coalesces a rapid stream of values (e.g. pointermove positions, wheel
 * deltas) down to at most one `commit` call per animation frame (checkpoint 1,
 * T1.1.1/T1.1.2). Every `push` overwrites the pending value and schedules a
 * frame only if one isn't already pending — so N pushes within the same frame
 * collapse into a single commit of the *latest* value.
 *
 * This is a plain, DOM-free unit extracted specifically so the coalescing
 * behavior itself (collapse-to-latest, synchronous flush, cancel-without-
 * commit) can be unit tested deterministically with a fake scheduler, rather
 * than relying on a brittle React-component test that has to fake real
 * animation frames through jsdom. InteractiveCanvasEditor wires this to the
 * real requestAnimationFrame/cancelAnimationFrame by default (via the
 * internal `rafScheduler`, used when no scheduler is passed).
 */
export function createFrameCoalescer<T>(
  commit: (value: T) => void,
  scheduler: FrameScheduler = rafScheduler,
): FrameCoalescer<T> {
  let pendingValue: T | null = null;
  let pendingHandle: number | null = null;
  let hasPending = false;

  const runPending = () => {
    pendingHandle = null;
    if (!hasPending) return;
    const value = pendingValue as T;
    hasPending = false;
    pendingValue = null;
    commit(value);
  };

  return {
    /** Records the latest value; schedules exactly one frame if none is pending. */
    push(value: T) {
      pendingValue = value;
      hasPending = true;
      if (pendingHandle !== null) return;
      pendingHandle = scheduler.request(runPending);
    },
    /**
     * Cancels any pending frame and, if a value was queued, commits it
     * synchronously right now. Used on pointerup/pointercancel so the drag end
     * is never dropped behind a frame that never fires (e.g. tab backgrounded).
     */
    flush() {
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }
      if (!hasPending) return;
      const value = pendingValue as T;
      hasPending = false;
      pendingValue = null;
      commit(value);
    },
    /**
     * Cancels any pending frame WITHOUT committing — used on unmount, where
     * committing a stale value after the component is gone would be wrong.
     */
    cancel() {
      if (pendingHandle !== null) {
        scheduler.cancel(pendingHandle);
        pendingHandle = null;
      }
      hasPending = false;
      pendingValue = null;
    },
    /** True while a frame is scheduled and waiting to commit. */
    get isPending() {
      return pendingHandle !== null;
    },
  };
}
