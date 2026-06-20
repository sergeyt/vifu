import { Bot, type Context, InputFile } from "grammy";
import { markUserSeen, notifyNewUser } from "@/admin.ts";
import type { Config } from "@/config.ts";
import { queueWaitMessage, RenderQueue } from "@/queue.ts";
import { getSession, resetSession, setSession } from "@/session.ts";
import { parsePlayerNames, renderVifu } from "@/vifu.ts";

const WELCOME = `🎬 <b>vifu</b> — video fun

<b>How it works</b>
1️⃣ Send a rally clip (video)
2️⃣ I'll ask for Player 1's name
3️⃣ Then Player 2's name
4️⃣ You get the fight edit ⚔️

Tip: add a caption like <code>ALEX vs SERGEI</code> on the video to skip the name prompts.

/cancel — start over
/help — tips`;

const HELP = `1. Send a rally clip (≤ ${
  Deno.env.get("MAX_VIDEO_MB") ?? "20"
} MB)
2. Answer when I ask for each player's name
   — or put <code>PLAYER1 vs PLAYER2</code> in the video caption
3. Wait ~30s–2min depending on length

Renders run one at a time on the free server — you may wait in a short queue.

/cancel — discard and start over`;

export function createBot(cfg: Config): Bot {
  const bot = new Bot(cfg.token);
  const renderQueue = new RenderQueue(
    cfg.maxConcurrentRenders,
    cfg.maxRenderQueue,
  );

  bot.catch((err) => {
    console.error("[bot] error:", err.error);
  });

  bot.use(async (ctx, next) => {
    const user = ctx.from;
    if (
      user &&
      cfg.adminChatId &&
      user.id !== cfg.adminChatId &&
      markUserSeen(user.id)
    ) {
      console.log(`[admin] new user ${user.id} @${user.username ?? "—"}`);
      void notifyNewUser(ctx.api, cfg.adminChatId, user);
    }
    await next();
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
    renderQueue.removeUser(userId);
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

    const file = await ctx.api.getFile(fileId);
    const size = file.file_size ?? ctx.message.video?.file_size ??
      ctx.message.document?.file_size ?? 0;
    if (size > cfg.maxVideoBytes) {
      await ctx.reply(
        `Video too large (max ${cfg.maxVideoBytes / 1024 / 1024} MB).`,
      );
      return;
    }

    const captionNames = ctx.message.caption
      ? parsePlayerNames(ctx.message.caption)
      : null;

    setSession(userId, { step: "downloading" });
    await ctx.reply("📥 Downloading your video…");

    const ext = file.file_path?.split(".").pop() ?? "mp4";
    let inputPath: string;
    try {
      inputPath = await downloadTelegramFile(
        cfg.token,
        file.file_path!,
        userId,
        ext,
      );
    } catch (error) {
      resetSession(userId);
      const message = error instanceof Error ? error.message : String(error);
      await ctx.reply(`❌ Couldn't download the video:\n${message}`);
      return;
    }

    if (captionNames) {
      await startRender(ctx, cfg, renderQueue, userId, {
        inputPath,
        player1: captionNames.player1,
        player2: captionNames.player2,
      });
      return;
    }

    setSession(userId, { step: "await_player1", inputPath });
    await ctx.reply(
      "✅ Video saved!\n\n<b>Who is Player 1?</b> (shown on the left / top)\nSend a name — e.g. <code>ALEX</code>",
      { parse_mode: "HTML" },
    );
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;

    const userId = ctx.from!.id;
    const session = getSession(userId);
    const text = ctx.message.text.trim();

    if (session.step === "idle") {
      await ctx.reply(
        "Send me a <b>video</b> first — I'll ask for player names right after.",
        { parse_mode: "HTML" },
      );
      return;
    }

    if (session.step === "downloading") {
      await ctx.reply(
        "⏳ Still downloading your video — I'll ask for names in a moment.",
      );
      return;
    }

    if (!session.inputPath) {
      await ctx.reply(
        "Something went wrong. Send the video again, or /cancel.",
      );
      resetSession(userId);
      return;
    }

    const bothNames = parsePlayerNames(text);
    if (bothNames) {
      await startRender(ctx, cfg, renderQueue, userId, {
        inputPath: session.inputPath,
        player1: bothNames.player1,
        player2: bothNames.player2,
      });
      return;
    }

    if (session.step === "await_player1") {
      const player1 = singleName(text);
      if (!player1) {
        await ctx.reply(
          "Send one name for Player 1, or both at once:\n<code>ALEX vs SERGEI</code>",
          { parse_mode: "HTML" },
        );
        return;
      }

      setSession(userId, {
        step: "await_player2",
        inputPath: session.inputPath,
        player1,
      });
      await ctx.reply(
        `Player 1: <b>${
          escapeHtml(player1)
        }</b>\n\n<b>Who is Player 2?</b> (right / bottom)\nSend a name.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    if (session.step === "await_player2") {
      const player2 = singleName(text);
      if (!player2 || !session.player1) {
        await ctx.reply("Send Player 2's name.");
        return;
      }

      await startRender(ctx, cfg, renderQueue, userId, {
        inputPath: session.inputPath,
        player1: session.player1,
        player2,
      });
    }
  });

  return bot;
}

async function startRender(
  ctx: Context,
  cfg: Config,
  renderQueue: RenderQueue,
  userId: number,
  opts: { inputPath: string; player1: string; player2: string },
): Promise<void> {
  if (!ctx.chat) return;

  if (renderQueue.hasUser(userId)) {
    await ctx.reply(
      "You already have a render queued. Please wait or /cancel.",
    );
    return;
  }

  if (renderQueue.isFull) {
    await ctx.reply(
      `🚦 Server is busy (${cfg.maxRenderQueue} clips max). Try again in a few minutes.`,
    );
    return;
  }

  const inputPath = opts.inputPath;
  const outputPath = inputPath.replace(/\.[^.]+$/, "") + "_fight.mp4";
  const { player1, player2 } = opts;

  resetSession(userId);

  let statusMessageId: number | undefined;
  try {
    const position = renderQueue.size >= cfg.maxConcurrentRenders
      ? renderQueue.size - cfg.maxConcurrentRenders + 1
      : 0;

    const status = await ctx.reply(
      `${queueWaitMessage(position)}\n\n⚔️ <b>${
        escapeHtml(player1)
      }</b> vs <b>${escapeHtml(player2)}</b>`,
      { parse_mode: "HTML" },
    );
    statusMessageId = status.message_id;
    const msgId = status.message_id;

    await renderQueue.enqueue({
      userId,
      run: async () => {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          msgId,
          `⚔️ Rendering <b>${escapeHtml(player1)}</b> vs <b>${
            escapeHtml(player2)
          }</b>…\nThis can take up to a couple of minutes.`,
          { parse_mode: "HTML" },
        );

        await renderVifu(cfg, {
          inputPath,
          outputPath,
          player1,
          player2,
        });

        await ctx.api.editMessageText(
          ctx.chat!.id,
          msgId,
          "✅ Done! Sending your fight clip…",
        );

        await ctx.replyWithVideo(new InputFile(outputPath), {
          caption: `${player1} vs ${player2} · vifu`,
        });
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[render]", message);
    if (statusMessageId !== undefined) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMessageId,
        `❌ Render failed:\n<pre>${escapeHtml(message.slice(0, 500))}</pre>`,
        { parse_mode: "HTML" },
      ).catch(() => ctx.reply(`❌ Render failed:\n${message.slice(0, 500)}`));
    } else {
      await ctx.reply(`❌ Render failed:\n${message.slice(0, 500)}`);
    }
  } finally {
    await Deno.remove(inputPath).catch(() => {});
    await Deno.remove(outputPath).catch(() => {});
  }
}

function singleName(text: string): string | null {
  const name = text.trim();
  if (!name || name.length > 40) return null;
  if (/^(?:vs|v|×|x)$/i.test(name)) return null;
  return name;
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
