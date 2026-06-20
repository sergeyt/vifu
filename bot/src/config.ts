export type Config = {
  token: string;
  vifuRoot: string;
  maxVideoBytes: number;
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
  const port = Number(Deno.env.get("PORT") ?? "8787");
  const publicUrl = Deno.env.get("BOT_PUBLIC_URL")?.trim() || undefined;

  return {
    token,
    vifuRoot,
    maxVideoBytes: maxMb * 1024 * 1024,
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
