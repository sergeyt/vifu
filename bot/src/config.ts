export type Config = {
  token: string;
  vifuRoot: string;
  maxVideoBytes: number;
  maxVideoSeconds: number;
  maxConcurrentRenders: number;
  maxRenderQueue: number;
  adminChatId?: number;
  publicUrl?: string;
  port: number;
};

export function loadConfig(): Config {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is required (see bot/.env.example)");
    Deno.exit(1);
  }

  const vifuRoot = Deno.env.get("VIFU_ROOT")?.trim() ||
    new URL("../..", import.meta.url).pathname;
  const maxMb = Number(Deno.env.get("MAX_VIDEO_MB") ?? "20");
  const maxVideoSeconds = Math.max(
    1,
    Number(Deno.env.get("MAX_VIDEO_SECONDS") ?? "30"),
  );
  const port = Number(Deno.env.get("PORT") ?? "8787");
  const publicUrl = Deno.env.get("BOT_PUBLIC_URL")?.trim() || undefined;
  const maxConcurrentRenders = Math.max(
    1,
    Number(Deno.env.get("MAX_CONCURRENT_RENDERS") ?? "1"),
  );
  const maxRenderQueue = Math.max(
    maxConcurrentRenders,
    Number(Deno.env.get("MAX_RENDER_QUEUE") ?? "3"),
  );
  const adminRaw = Deno.env.get("ADMIN_CHAT_ID")?.trim();
  const adminChatId = adminRaw ? Number(adminRaw) : undefined;
  if (adminRaw && !Number.isFinite(adminChatId)) {
    console.error("ADMIN_CHAT_ID must be a numeric Telegram chat id");
    Deno.exit(1);
  }

  return {
    token,
    vifuRoot,
    maxVideoBytes: maxMb * 1024 * 1024,
    maxVideoSeconds,
    maxConcurrentRenders,
    maxRenderQueue,
    adminChatId,
    publicUrl,
    port,
  };
}

export function useWebhook(cfg: Config): boolean {
  return Boolean(cfg.publicUrl);
}

export function webhookUrl(cfg: Config): string {
  return `${cfg.publicUrl!.replace(/\/$/, "")}/webhook`;
}
