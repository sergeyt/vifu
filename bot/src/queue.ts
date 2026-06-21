import type { Api } from "grammy";
import type { Config } from "@/config.ts";
import type { RenderJobOptions } from "@/renderJob.ts";
import {
  cleanupJobFiles,
  executeRenderJob,
  logRenderError,
  notifyRenderFailed,
} from "@/renderJob.ts";
import {
  type QueueStore,
  QueueStore as QueueStoreImpl,
  type RenderJobInsert,
  type RenderJobRecord,
} from "@/queueStore.ts";

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type JobRunner = (
  api: Api,
  cfg: Config,
  job: RenderJobRecord,
  opts?: RenderJobOptions,
) => Promise<void>;

export class RenderQueue {
  private active = 0;
  private waiters = new Map<number, Waiter>();

  constructor(
    private store: QueueStore,
    private maxConcurrent: number,
    private maxTotal: number,
    private api: Api,
    private cfg: Config,
    private runJob: JobRunner = executeRenderJob,
  ) {}

  static open(cfg: Config, api: Api): RenderQueue {
    const store = new QueueStoreImpl(cfg.dataDir);
    return new RenderQueue(
      store,
      cfg.maxConcurrentRenders,
      cfg.maxRenderQueue,
      api,
      cfg,
    );
  }

  hasUser(userId: number): boolean {
    return this.store.hasUser(userId);
  }

  get size(): number {
    return this.store.countActive();
  }

  get isFull(): boolean {
    return this.size >= this.maxTotal;
  }

  cancelUser(userId: number): void {
    const cancelled = this.store.cancelPending(userId);
    for (const job of cancelled) {
      const waiter = this.waiters.get(job.id);
      if (waiter) {
        waiter.reject(new Error("CANCELLED"));
        this.waiters.delete(job.id);
      }
      void cleanupJobFiles(job);
    }
  }

  /** Resume pending jobs after restart/re-deploy. Call once after bot.init(). */
  async recover(): Promise<void> {
    const reset = this.store.resetRunningToPending();
    if (reset > 0) {
      console.log(`[queue] re-queued ${reset} interrupted render(s)`);
    }

    for (const job of this.store.listActive()) {
      try {
        await Deno.stat(job.inputPath);
      } catch {
        const message = "Video file missing after restart — please send again.";
        this.store.markFailed(job.id, message);
        await notifyRenderFailed(this.api, job, message);
        await cleanupJobFiles(job);
      }
    }

    const pruned = this.store.pruneTerminal(Date.now() - 86_400_000);
    if (pruned > 0) {
      console.log(`[queue] pruned ${pruned} old job record(s)`);
    }

    this.drain();
  }

  /**
   * Enqueue a render job. Resolves when the job finishes.
   * Job survives process restarts (stored in SQLite).
   */
  enqueue(job: RenderJobInsert): Promise<void> {
    if (this.store.hasUser(job.userId)) {
      return Promise.reject(new Error("ALREADY_QUEUED"));
    }
    if (this.isFull) {
      return Promise.reject(new Error("QUEUE_FULL"));
    }

    let jobId: number;
    try {
      jobId = this.store.insert(job);
    } catch (error) {
      if (isUniqueUserViolation(error)) {
        return Promise.reject(new Error("ALREADY_QUEUED"));
      }
      throw error;
    }

    return new Promise<void>((resolve, reject) => {
      this.waiters.set(jobId, { resolve, reject });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.maxConcurrent) {
      const job = this.store.claimNext();
      if (!job) break;

      this.active++;
      const recovered = !this.waiters.has(job.id);

      void this.runJob(this.api, this.cfg, job, { recovered })
        .then(() => {
          this.store.markDone(job.id);
          this.resolveWaiter(job.id);
        })
        .catch(async (error) => {
          const message = logRenderError(error, job);
          this.store.markFailed(job.id, message);
          this.rejectWaiter(
            job.id,
            error instanceof Error ? error : new Error(message),
          );
          await notifyRenderFailed(this.api, job, message);
        })
        .finally(async () => {
          await cleanupJobFiles(job);
          this.active--;
          this.drain();
        });
    }
  }

  private resolveWaiter(jobId: number): void {
    const waiter = this.waiters.get(jobId);
    if (waiter) {
      waiter.resolve();
      this.waiters.delete(jobId);
    }
  }

  private rejectWaiter(jobId: number, error: Error): void {
    const waiter = this.waiters.get(jobId);
    if (waiter) {
      waiter.reject(error);
      this.waiters.delete(jobId);
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

function isUniqueUserViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed");
}
