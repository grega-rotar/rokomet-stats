/** Counts running jobs; `acquire` waits in line when all slots are taken. */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  /** True if `acquire` would not have to wait right now. */
  get free() {
    return this.active < this.limit && this.queue.length === 0;
  }

  /** Resolves to a release function. Rejects if `signal` aborts while still waiting. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    const release = () => {
      this.active--;
      this.queue.shift()?.();
    };
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(once(release));
    }
    return new Promise((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener("abort", onAbort);
        this.active++;
        resolve(once(release));
      };
      const onAbort = () => {
        this.queue = this.queue.filter((f) => f !== go);
        reject(new Error("aborted"));
      };
      if (signal?.aborted) return reject(new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.queue.push(go);
    });
  }
}

function once(fn: () => void) {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      fn();
    }
  };
}
