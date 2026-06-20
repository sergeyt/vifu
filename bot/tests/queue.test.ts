import { RenderQueue } from "../src/queue.ts";

Deno.test("RenderQueue runs one job at a time", async () => {
  const q = new RenderQueue(1, 3);
  const order: number[] = [];

  const first = q.enqueue({
    userId: 1,
    run: async () => {
      order.push(1);
      await delay(20);
    },
  });
  const second = q.enqueue({
    userId: 2,
    run: () => {
      order.push(2);
      return Promise.resolve();
    },
  });

  await Promise.all([first, second]);
  if (order.join(",") !== "1,2") {
    throw new Error(`expected order 1,2 got ${order.join(",")}`);
  }
});

Deno.test("RenderQueue rejects when full", async () => {
  const q = new RenderQueue(1, 2);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });

  void q.enqueue({ userId: 1, run: () => gate });
  void q.enqueue({ userId: 2, run: () => Promise.resolve() });

  let rejected = false;
  try {
    await q.enqueue({ userId: 3, run: () => Promise.resolve() });
  } catch (error) {
    rejected = error instanceof Error && error.message === "QUEUE_FULL";
  }

  release();
  if (!rejected) throw new Error("expected QUEUE_FULL");
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
