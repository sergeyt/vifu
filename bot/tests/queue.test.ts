import { RenderQueue } from "../src/queue.ts";
import { QueueStore } from "../src/queueStore.ts";
import type { Config } from "../src/config.ts";
import type { Api } from "grammy";

function testConfig(dataDir: string): Config {
  return {
    token: "test-token",
    vifuRoot: "/tmp/vifu",
    dataDir,
    maxVideoBytes: 20 * 1024 * 1024,
    maxVideoSeconds: 30,
    maxConcurrentRenders: 1,
    maxRenderQueue: 3,
    port: 8787,
  };
}

function mockApi(): Api {
  return {
    editMessageText: () => Promise.resolve(true),
    sendVideo: () => Promise.resolve({ message_id: 1 }),
    sendMessage: () => Promise.resolve({ message_id: 1 }),
  } as unknown as Api;
}

Deno.test("RenderQueue runs one job at a time", async () => {
  const dataDir = await Deno.makeTempDir();
  const store = new QueueStore(dataDir);
  const order: number[] = [];
  const q = new RenderQueue(store, 1, 3, mockApi(), testConfig(dataDir), async (
    _api,
    _cfg,
    job,
  ) => {
    order.push(job.userId);
    if (job.userId === 1) await delay(20);
  });

  const first = q.enqueue({
    userId: 1,
    chatId: 10,
    statusMessageId: 100,
    inputPath: `${dataDir}/1.mp4`,
    outputPath: `${dataDir}/1_out.mp4`,
    player1: "A",
    player2: "B",
  });
  const second = q.enqueue({
    userId: 2,
    chatId: 20,
    statusMessageId: 200,
    inputPath: `${dataDir}/2.mp4`,
    outputPath: `${dataDir}/2_out.mp4`,
    player1: "C",
    player2: "D",
  });

  await Promise.all([first, second]);
  if (order.join(",") !== "1,2") {
    throw new Error(`expected order 1,2 got ${order.join(",")}`);
  }
});

Deno.test("RenderQueue rejects when full", async () => {
  const dataDir = await Deno.makeTempDir();
  const store = new QueueStore(dataDir);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });

  const q = new RenderQueue(
    store,
    1,
    2,
    mockApi(),
    testConfig(dataDir),
    () => gate,
  );

  void q.enqueue({
    userId: 1,
    chatId: 10,
    statusMessageId: 100,
    inputPath: `${dataDir}/1.mp4`,
    outputPath: `${dataDir}/1_out.mp4`,
    player1: "A",
    player2: "B",
  });
  void q.enqueue({
    userId: 2,
    chatId: 20,
    statusMessageId: 200,
    inputPath: `${dataDir}/2.mp4`,
    outputPath: `${dataDir}/2_out.mp4`,
    player1: "C",
    player2: "D",
  });

  let rejected = false;
  try {
    await q.enqueue({
      userId: 3,
      chatId: 30,
      statusMessageId: 300,
      inputPath: `${dataDir}/3.mp4`,
      outputPath: `${dataDir}/3_out.mp4`,
      player1: "E",
      player2: "F",
    });
  } catch (error) {
    rejected = error instanceof Error && error.message === "QUEUE_FULL";
  }

  release();
  if (!rejected) throw new Error("expected QUEUE_FULL");
});

Deno.test("RenderQueue survives restart and resumes pending jobs", async () => {
  const dataDir = await Deno.makeTempDir();
  const inputPath = `${dataDir}/clip.mp4`;
  await Deno.writeTextFile(inputPath, "fake");

  const store = new QueueStore(dataDir);
  store.insert({
    userId: 7,
    chatId: 88,
    statusMessageId: 600,
    inputPath,
    outputPath: `${dataDir}/clip_fight.mp4`,
    player1: "X",
    player2: "Y",
  });

  let resumed = false;
  const q = new RenderQueue(store, 1, 2, mockApi(), testConfig(dataDir), async (
    _api,
    _cfg,
    job,
    opts,
  ) => {
    resumed = true;
    if (!opts?.recovered) throw new Error("expected recovered flag");
    if (job.userId !== 7) throw new Error("wrong resumed user");
  });

  await q.recover();
  await delay(50);
  if (!resumed) throw new Error("pending job should resume after recover()");
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
