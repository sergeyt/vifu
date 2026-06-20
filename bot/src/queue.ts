export type QueueJob<T> = {
  userId: number;
  run: () => Promise<T>;
};

export class RenderQueue {
  private waiting: QueueJob<unknown>[] = [];
  private active = 0;

  constructor(
    private maxConcurrent: number,
    /** Max jobs in the system (running + waiting). */
    private maxTotal: number,
  ) {}

  hasUser(userId: number): boolean {
    return this.waiting.some((job) => job.userId === userId);
  }

  get size(): number {
    return this.active + this.waiting.length;
  }

  get isFull(): boolean {
    return this.size >= this.maxTotal;
  }

  removeUser(userId: number): boolean {
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((job) => job.userId !== userId);
    return this.waiting.length < before;
  }

  /**
   * Enqueue a render job. Resolves when the job finishes.
   * @returns queue position at enqueue time (0 = starting now).
   */
  enqueue<T>(job: QueueJob<T>): Promise<T> {
    if (this.hasUser(job.userId)) {
      return Promise.reject(new Error("ALREADY_QUEUED"));
    }
    if (this.isFull) {
      return Promise.reject(new Error("QUEUE_FULL"));
    }

    return new Promise<T>((resolve, reject) => {
      this.waiting.push({
        userId: job.userId,
        run: async () => {
          try {
            const result = await job.run();
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      this.active++;
      job.run()
        .catch((error) => {
          console.error("[queue] job failed:", error);
        })
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }
}

export function queueWaitMessage(position: number): string {
  if (position <= 0) {
    return "Starting your render now…";
  }
  if (position === 1) {
    return "⏳ One clip ahead of you — you're next.";
  }
  return `⏳ Queue position: ${position + 1} (${position} ahead of you).`;
}
