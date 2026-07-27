export class Semaphore {
  readonly capacity: number;
  #available: number;
  #waiters: Array<() => void> = [];

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`Semaphore capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.#available = capacity;
  }

  get active(): number {
    return this.capacity - this.#available;
  }

  get pending(): number {
    return this.#waiters.length;
  }

  async acquire(): Promise<() => void> {
    if (this.#available > 0) {
      this.#available -= 1;
      return this.#release;
    }
    await new Promise<void>((resolve) => this.#waiters.push(resolve));
    return this.#release;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  #release = (): void => {
    const next = this.#waiters.shift();
    if (next) {
      next();
      return;
    }
    if (this.#available >= this.capacity) {
      throw new Error("Semaphore released more times than acquired");
    }
    this.#available += 1;
  };
}
