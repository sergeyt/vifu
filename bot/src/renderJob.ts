import type { Api } from "grammy";
import { InputFile } from "grammy";
import type { Config } from "@/config.ts";
import type { RenderJobRecord } from "@/queueStore.ts";
import { captureException } from "@/sentry.ts";
import { renderVifu } from "@/vifu.ts";

export type RenderJobOptions = {
  /** Job survived a restart — no in-process waiter is attached. */
  recovered?: boolean;
};

export async function executeRenderJob(
  api: Api,
  cfg: Config,
  job: RenderJobRecord,
  opts: RenderJobOptions = {},
): Promise<void> {
  const { chatId, statusMessageId, inputPath, outputPath, player1, player2 } =
    job;

  try {
    await Deno.stat(inputPath);
  } catch {
    throw new Error("Input video missing");
  }

  const renderingText = opts.recovered
    ? `🔄 Server restarted — resuming your render…\n\n⚔️ Rendering <b>${
      escapeHtml(player1)
    }</b> vs <b>${escapeHtml(player2)}</b>…`
    : `⚔️ Rendering <b>${escapeHtml(player1)}</b> vs <b>${
      escapeHtml(player2)
    }</b>…\nThis can take up to a couple of minutes.`;

  await api.editMessageText(chatId, statusMessageId, renderingText, {
    parse_mode: "HTML",
  });

  await renderVifu(cfg, { inputPath, outputPath, player1, player2 });

  await api.editMessageText(
    chatId,
    statusMessageId,
    "✅ Done! Sending your fight clip…",
  );

  await api.sendVideo(chatId, new InputFile(outputPath), {
    caption: `${player1} vs ${player2} · vifu`,
  });
}

export async function notifyRenderFailed(
  api: Api,
  job: RenderJobRecord,
  message: string,
): Promise<void> {
  const text = `❌ Render failed:\n<pre>${
    escapeHtml(message.slice(0, 500))
  }</pre>`;
  try {
    await api.editMessageText(job.chatId, job.statusMessageId, text, {
      parse_mode: "HTML",
    });
  } catch {
    await api.sendMessage(
      job.chatId,
      `❌ Render failed:\n${message.slice(0, 500)}`,
    )
      .catch(() => {});
  }
}

export async function cleanupJobFiles(job: RenderJobRecord): Promise<void> {
  await Deno.remove(job.inputPath).catch(() => {});
  await Deno.remove(job.outputPath).catch(() => {});
}

export function logRenderError(
  error: unknown,
  job: RenderJobRecord,
): string {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[render]", message);
  captureException(error instanceof Error ? error : new Error(message), {
    handler: "render",
    job_id: job.id,
    user_id: job.userId,
    player1: job.player1,
    player2: job.player2,
    recovered: job.status === "pending",
  });
  return message;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
