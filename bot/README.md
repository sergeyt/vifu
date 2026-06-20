# vifu Telegram bot

Simple Deno bot: user sends a video + player names → bot runs `vifu process` → returns fight clip.

## Prerequisites

- [Deno](https://deno.land/) 2.x
- [uv](https://docs.astral.sh/uv/) + vifu CLI working in repo root (`uv sync --all-extras`)
- `ffmpeg` on PATH (for audio mux)
- Telegram bot token from [@BotFather](https://t.me/BotFather)

## Setup

```bash
cd bot
cp .env.example .env
# edit .env — set TELEGRAM_BOT_TOKEN
```

## Run (dev, long polling)

From repo root, ensure vifu works:

```bash
uv sync --all-extras
ffmpeg -version
```

Start bot:

```bash
cd bot
deno task dev
```

## Usage in Telegram

1. `/start`
2. Send a video
3. Reply: `ALEX vs SERGEI`
4. Wait for rendered clip

## Env

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Required |
| `VIFU_ROOT` | Path to vifu repo (default: parent of `bot/`) |
| `MAX_VIDEO_MB` | Upload limit (default 20) |
| `BOT_PUBLIC_URL` | If set, use webhook instead of polling |
| `PORT` | Webhook server port (default 8787) |

## Production webhook

```bash
BOT_PUBLIC_URL=https://your-host.example.com deno task start
```

Telegram will POST to `{BOT_PUBLIC_URL}/webhook`.

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for Docker, free VPS options (Oracle, Fly.io), and why Deno Deploy alone won't work.

Quick Docker run from repo root:

```bash
docker compose up -d --build
```
