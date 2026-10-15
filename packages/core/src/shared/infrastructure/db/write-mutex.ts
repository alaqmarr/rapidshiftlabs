/**
 * In-process async write mutex queue for serializing writes per SQLite database file.
 * Reads bypass this mutex entirely to leverage concurrent SQLite WAL reads.
 */
export class WriteMutex {
  private queue: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.queue;
    this.queue = previousLock.then(
      () => lockAcquired,
      () => lockAcquired,
    );

    // Wait for our turn in the queue
    await previousLock;

    try {
      return await fn();
    } finally {
      releaseLock();
    }
  }
}
