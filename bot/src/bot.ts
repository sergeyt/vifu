import { Bot, InputFile } from "grammy";
import type { Config } from "@/config.ts";
import { getSession, resetSession, setSession } from "@/session.ts";
import { parsePlayerNames, renderVifu } from "@/vifu.ts";

const WELCOME = `🎬 <b>vifu</b> — video fun

Send me a <b>video</b> (or video file), then reply with player names:

<code>ALEX vs SERGEI</code>

I'll add fight HUD, health bars, and the bell — keeping your clip's natural hits.

/cancel — reset
/help — tips`;

const HELP = `1. Send a rally clip (≤ ${
  Deno.env.get("MAX_VIDEO_MB") ?? "20"
} MB)
2. Reply: <code>PLAYER1 vs PLAYER2</code>
3. Wait ~30s–2min depending on length

Tips:
• Names can be teams or players
• Use /cancel to start over`;

export function createBot(cfg: Config): Bot {
  const bot = new Bot(cfg.token);

  bot.catch((err) => {
    console.error("[bot] error:", err.error);
  });

  bot.command("start", async (ctx) => {
    resetSession(ctx.from!.id);
    await ctx.reply(WELCOME, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP, { parse_mode: "HTML" });
  });

  bot.command("cancel", async (ctx) => {
    const userId = ctx.from!.id;
    const session = getSession(userId);
    if (session.inputPath) {
      await Deno.remove(session.inputPath).catch(() => {});
    }
    resetSession(userId);
    await ctx.reply("Cancelled. Send a new video when ready.");
  });

  bot.on(["message:video", "message:document"], async (ctx) => {
    const userId = ctx.from!.id;
    const session = getSession(userId);

    if (session.inputPath) {
      await Deno.remove(session.inputPath).catch(() => {});
    }

    const fileId = ctx.message.video?.file_id ??
      (ctx.message.document?.mime_type?.startsWith("video/")
        ? ctx.message.document.file_id
        : undefined);

    if (!fileId) {
      await ctx.reply("Please send a video file.");
      return;
    }

    const file = await ctx.getFile();
    const size = file.file_size ?? 0;
    if (size > cfg.maxVideoBytes) {
      await ctx.reply(
        `Video too large (max ${cfg.maxVideoBytes / 1024 / 1024} MB).`,
      );
      return;
    }

    await ctx.reply("📥 Downloading…");

    const ext = file.file_path?.split(".").pop() ?? "mp4";
    const inputPath = await downloadTelegramFile(
      cfg.token,
      file.file_path!,
      userId,
      ext,
    );

    setSession(userId, { step: "await_names", inputPath });
    await ctx.reply(
      "Got it! Now send player names:\n\n<code>PLAYER1 vs PLAYER2</code>",
      { parse_mode: "HTML" },
    );
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    const userId = ctx.from!.id;
    const session = getSession(userId);

    if (session.step !== "await_names" || !session.inputPath) {
      await ctx.reply("Send a video first, then player names.");
      return;
    }

    const names = parsePlayerNames(ctx.message.text);
    if (!names) {
      await ctx.reply("Use format: <code>ALEX vs SERGEI</code>", {
        parse_mode: "HTML",
      });
      return;
    }

    const status = await ctx.reply(
      `⚔️ Rendering <b>${names.player1}</b> vs <b>${names.player2}</b>…`,
      { parse_mode: "HTML" },
    );

    const outputPath = session.inputPath.replace(/\.[^.]+$/, "") + "_fight.mp4";

    try {
      await renderVifu(cfg, {
        inputPath: session.inputPath,
        outputPath,
        player1: names.player1,
        player2: names.player2,
      });

      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        "✅ Done! Sending your fight clip…",
      );

      await ctx.replyWithVideo(new InputFile(outputPath), {
        caption: `${names.player1} vs ${names.player2} · vifu`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[render]", message);
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `❌ Render failed:\n<pre>${escapeHtml(message.slice(0, 500))}</pre>`,
        { parse_mode: "HTML" },
      );
    } finally {
      await Deno.remove(session.inputPath).catch(() => {});
      await Deno.remove(outputPath).catch(() => {});
      resetSession(userId);
    }
  });

  return bot;
}

async function downloadTelegramFile(
  token: string,
  filePath: string,
  userId: number,
  ext: string,
): Promise<string> {
  const dir = new URL("../tmp/", import.meta.url).pathname;
  await Deno.mkdir(dir, { recursive: true });
  const localPath = `${dir}${userId}_${Date.now()}.${ext}`;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram download failed: ${res.status}`);
  }
  await Deno.writeFile(localPath, new Uint8Array(await res.arrayBuffer()));
  return localPath;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
