import "@/sentry.ts";
import { webhookCallback } from "grammy";
import { createBot } from "@/bot.ts";
import { loadConfig, useWebhook, webhookUrl } from "@/config.ts";
import { captureException, flushSentry } from "@/sentry.ts";

addEventListener("unhandledrejection", (event) => {
  console.error("[bot] unhandled rejection:", event.reason);
  captureException(event.reason);
});

const cfg = loadConfig();
const bot = createBot(cfg);

try {
  await bot.init();
  console.log(`[bot] @${bot.botInfo.username} ready`);

  if (!useWebhook(cfg)) {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log("[bot] long-polling…");
    await bot.start({
      onStart: (info) =>
        console.log(`[bot] polling as @${info.username} (id=${info.id})`),
    });
  } else {
    const url = webhookUrl(cfg);
    await bot.api.setWebhook(url, { drop_pending_updates: false });
    console.log(`[bot] webhook → ${url}`);

    const handle = webhookCallback(bot, "std/http");
    Deno.serve({ port: cfg.port }, async (req) => {
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && path === "/health") {
        return new Response("ok");
      }
      if (req.method === "POST" && path === "/webhook") {
        return await handle(req);
      }
      return new Response("not found", { status: 404 });
    });
  }
} catch (error) {
  console.error("[bot] fatal:", error);
  captureException(error);
  await flushSentry();
  Deno.exit(1);
}
