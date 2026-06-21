import { QueueStore } from "../src/queueStore.ts";

Deno.test("QueueStore enforces one active job per user", () => {
  const dataDir = Deno.makeTempDirSync();
  const store = new QueueStore(dataDir);

  store.insert({
    userId: 1,
    chatId: 10,
    statusMessageId: 100,
    inputPath: "/tmp/a.mp4",
    outputPath: "/tmp/a_out.mp4",
    player1: "A",
    player2: "B",
  });

  if (!store.hasUser(1)) throw new Error("expected hasUser(1)");
  if (store.countActive() !== 1) throw new Error("expected 1 active job");

  let duplicate = false;
  try {
    store.insert({
      userId: 1,
      chatId: 10,
      statusMessageId: 101,
      inputPath: "/tmp/b.mp4",
      outputPath: "/tmp/b_out.mp4",
      player1: "C",
      player2: "D",
    });
  } catch {
    duplicate = true;
  }
  if (!duplicate) throw new Error("expected UNIQUE constraint on same user");

  const job = store.claimNext();
  if (!job || job.status !== "running") {
    throw new Error("expected claimed running job");
  }
  if (store.countActive() !== 1) {
    throw new Error("running still counts as active");
  }

  store.markDone(job.id);
  if (store.countActive() !== 0) throw new Error("expected no active jobs");
});

Deno.test("QueueStore cancelPending only cancels queued jobs", () => {
  const dataDir = Deno.makeTempDirSync();
  const store = new QueueStore(dataDir);

  store.insert({
    userId: 5,
    chatId: 50,
    statusMessageId: 500,
    inputPath: "/tmp/p1.mp4",
    outputPath: "/tmp/p1_out.mp4",
    player1: "A",
    player2: "B",
  });
  store.insert({
    userId: 6,
    chatId: 60,
    statusMessageId: 600,
    inputPath: "/tmp/p2.mp4",
    outputPath: "/tmp/p2_out.mp4",
    player1: "C",
    player2: "D",
  });

  const claimed = store.claimNext();
  if (!claimed || claimed.userId !== 5) {
    throw new Error("expected first job claimed");
  }

  const cancelled = store.cancelPending(6);
  if (cancelled.length !== 1 || cancelled[0].userId !== 6) {
    throw new Error("expected user 6 pending job cancelled");
  }
  if (!store.hasUser(5)) throw new Error("user 5 should still be running");
  if (store.hasUser(6)) throw new Error("user 6 should no longer be active");
});
