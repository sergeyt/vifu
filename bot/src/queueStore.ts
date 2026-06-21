import { Database } from "@db/sqlite";

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type RenderJobInsert = {
  userId: number;
  chatId: number;
  statusMessageId: number;
  inputPath: string;
  outputPath: string;
  player1: string;
  player2: string;
};

export type RenderJobRecord = RenderJobInsert & {
  id: number;
  status: JobStatus;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

type JobRow = {
  id: number;
  user_id: number;
  chat_id: number;
  status_message_id: number;
  input_path: string;
  output_path: string;
  player1: string;
  player2: string;
  status: JobStatus;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
};

export class QueueStore {
  private db: Database;

  constructor(dataDir: string) {
    Deno.mkdir(dataDir, { recursive: true });
    this.db = new Database(`${dataDir}/queue.db`);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        status_message_id INTEGER NOT NULL,
        input_path TEXT NOT NULL,
        output_path TEXT NOT NULL,
        player1 TEXT NOT NULL,
        player2 TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_render_jobs_status_created
        ON render_jobs(status, created_at);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_one_active_per_user
        ON render_jobs(user_id)
        WHERE status IN ('pending', 'running');
    `);
  }

  insert(job: RenderJobInsert): number {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO render_jobs (
        user_id, chat_id, status_message_id,
        input_path, output_path, player1, player2,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      job.userId,
      job.chatId,
      job.statusMessageId,
      job.inputPath,
      job.outputPath,
      job.player1,
      job.player2,
      now,
    );
    return Number(this.db.lastInsertRowId);
  }

  hasUser(userId: number): boolean {
    const row = this.db.prepare(`
      SELECT 1 AS ok FROM render_jobs
      WHERE user_id = ? AND status IN ('pending', 'running')
      LIMIT 1
    `).get(userId) as { ok: number } | undefined;
    return row !== undefined;
  }

  countActive(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS n FROM render_jobs
      WHERE status IN ('pending', 'running')
    `).get() as { n: number };
    return row.n;
  }

  listActive(): RenderJobRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM render_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at ASC
    `).all() as JobRow[];
    return rows.map(rowToRecord);
  }

  /** Interrupted jobs (status=running) become pending again on startup. */
  resetRunningToPending(): number {
    const now = Date.now();
    return this.db.prepare(`
      UPDATE render_jobs
      SET status = 'pending', started_at = NULL
      WHERE status = 'running'
    `).run(now);
  }

  claimNext(): RenderJobRecord | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`
        SELECT * FROM render_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as JobRow | undefined;

      if (!row) {
        this.db.exec("ROLLBACK");
        return null;
      }

      const now = Date.now();
      const updated = this.db.prepare(`
        UPDATE render_jobs
        SET status = 'running', started_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(now, row.id);

      if (updated === 0) {
        this.db.exec("ROLLBACK");
        return null;
      }

      this.db.exec("COMMIT");
      return rowToRecord({ ...row, status: "running", started_at: now });
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  markDone(id: number): void {
    this.db.prepare(`
      UPDATE render_jobs
      SET status = 'done', finished_at = ?, error = NULL
      WHERE id = ?
    `).run(Date.now(), id);
  }

  markFailed(id: number, error: string): void {
    this.db.prepare(`
      UPDATE render_jobs
      SET status = 'failed', finished_at = ?, error = ?
      WHERE id = ?
    `).run(Date.now(), error.slice(0, 2000), id);
  }

  cancelPending(userId: number): RenderJobRecord[] {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM render_jobs
      WHERE user_id = ? AND status = 'pending'
    `).all(userId) as JobRow[];

    if (rows.length === 0) return [];

    this.db.prepare(`
      UPDATE render_jobs
      SET status = 'cancelled', finished_at = ?
      WHERE user_id = ? AND status = 'pending'
    `).run(now, userId);

    return rows.map((row) =>
      rowToRecord({ ...row, status: "cancelled", finished_at: now })
    );
  }

  /** Drop old terminal rows so the DB stays small. */
  pruneTerminal(olderThanMs: number): number {
    return this.db.prepare(`
      DELETE FROM render_jobs
      WHERE status IN ('done', 'failed', 'cancelled')
        AND finished_at IS NOT NULL
        AND finished_at < ?
    `).run(olderThanMs);
  }
}

function rowToRecord(row: JobRow): RenderJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    chatId: row.chat_id,
    statusMessageId: row.status_message_id,
    inputPath: row.input_path,
    outputPath: row.output_path,
    player1: row.player1,
    player2: row.player2,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
