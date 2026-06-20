# Deploying the vifu Telegram bot

## What the bot needs at runtime

| Dependency | Why |
|---|---|
| Deno | Telegram bot (grammY) |
| uv + Python + vifu | `uv run vifu process` subprocess |
| ffmpeg | Audio mux in vifu |
| Outbound HTTPS | Telegram API |

Video rendering is **CPU-heavy** and runs **subprocesses** — use a **VPS or Docker**, not serverless (no Deno Deploy, Workers, etc.).

---

## Free / cheap hosting options

| Option | Cost | Notes |
|---|---|---|
| **Oracle Cloud Always Free** | $0 | Best — 1–4 ARM VMs, 24/7, run Docker |
| **Fly.io** | Free allowance | Docker deploy; may sleep/bill if over limit |
| **Google Cloud e2-micro** | Free tier* | 1 tiny VM, always-free in some regions |
| **Railway** | ~$5/mo credit | Easy Docker; credit runs out |
| **Your Mac / home PC** | $0 | Last resort — polling only; machine must stay on |

\*Check current GCP always-free rules for your region.

**Recommendation:** Docker on **Oracle Always Free** (production). Use Fly.io if you want less ops.

---

## Option D — Fly.io (managed Docker)

Repo includes [`fly.toml`](../fly.toml) at the project root. **Polling by default** — no public URL or TLS setup.

### 1. Install CLI & log in

```bash
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Create app (first time — required before CI deploy)

Edit `app = "vifu"` in `fly.toml` if you want a different name, then **once**:

```bash
fly apps create vifu
fly secrets set TELEGRAM_BOT_TOKEN="123456:ABC..." -a vifu
```

GitHub Actions needs a **deploy token scoped to that app** (a generic account token is not enough):

```bash
fly tokens create deploy -a vifu -x 999999h
```

Copy the token → GitHub repo → **Settings → Secrets → Actions** → `FLY_API_TOKEN`.

### 3. Set secrets

```bash
fly secrets set TELEGRAM_BOT_TOKEN="123456:ABC..." -a vifu
```

Optional:

```bash
fly secrets set MAX_VIDEO_MB=20 -a vifu
fly secrets set ADMIN_CHAT_ID=123456789 -a vifu   # your Telegram user id — new-user alerts
```

`VIFU_ROOT=/app` is set in `fly.toml` (do not point at your laptop path).

### 4. Deploy

From repo root:

```bash
fly deploy
fly logs
```

**GitHub Actions (auto):** every push to `main` deploys after CI passes (see [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)).

Requires the one-time setup in step 2 (`fly apps create` + deploy token with `-a vifu`).

### 5. Ops

```bash
fly status
fly ssh console          # shell inside the VM
fly secrets list
fly deploy               # manual deploy (CI auto-deploys on push to main)
```

### Polling vs webhook on Fly

| Mode | Config |
|---|---|
| **Polling** (default) | No `[http_service]` in `fly.toml`. Machine stays up; bot pulls from Telegram. |
| **Webhook** | `fly secrets set BOT_PUBLIC_URL=https://<app>.fly.dev PORT=8787`, uncomment `[http_service]` in `fly.toml`, redeploy. Fly provides HTTPS automatically. |

### Cost & sizing

- **Single machine:** `fly.toml` uses 1 shared CPU / 1 GB RAM. CI runs `fly scale count 1` after each deploy.
- To drop a second machine now: `fly scale count 1 -a vifu`
- **Render queue:** 1 clip rendering at a time, up to 3 jobs total (`MAX_CONCURRENT_RENDERS`, `MAX_RENDER_QUEUE` in `fly.toml`). Extra requests get a busy message.
- Always-on polling **does not sleep** (no `[http_service]`). Check [Fly pricing](https://fly.io/docs/about/pricing/) — 1×1 GB is much cheaper than 2×2 GB.

### Region

Change `primary_region` in `fly.toml` (e.g. `iad`, `sin`, `fra`) before first deploy. Pick one close to you.

---

## Option A — Docker (recommended)

### 1. Build

From repo root:

```bash
docker build -t vifu-bot .
```

### 2. Configure

```bash
cp bot/.env.example bot/.env
# TELEGRAM_BOT_TOKEN=...
# Leave BOT_PUBLIC_URL unset → long polling (simplest)
```

### 3. Run

```bash
docker compose up -d
docker compose logs -f
```

Or without compose:

```bash
docker run --rm --env-file bot/.env -e VIFU_ROOT=/app vifu-bot
```

### 4. Oracle Cloud (sketch)

1. Create **Always Free** ARM instance (Ubuntu).
2. Install Docker: `curl -fsSL https://get.docker.com | sh`
3. Clone repo, add `bot/.env`.
4. `docker compose up -d --build`
5. Open **outbound** internet (default). **No inbound ports** needed for polling.

---

## Option B — VPS without Docker

On Ubuntu/Debian VM:

```bash
# deno
curl -fsSL https://deno.land/install.sh | sh

# uv + ffmpeg
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo apt install ffmpeg

git clone <your-repo> vifu && cd vifu
uv sync --all-extras

cd bot && cp .env.example .env
# edit .env

# systemd (polling)
sudo tee /etc/systemd/system/vifu-bot.service << 'EOF'
[Unit]
Description=vifu Telegram bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/vifu/bot
EnvironmentFile=/home/ubuntu/vifu/bot/.env
Environment=VIFU_ROOT=/home/ubuntu/vifu
ExecStart=/home/ubuntu/.deno/bin/deno run --allow-env --allow-net --allow-read --allow-write --allow-run --allow-sys --allow-import src/main.ts
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now vifu-bot
```

---

## Option C — Local Mac / home PC (last resort)

Only if you cannot use a VPS yet. Your machine must stay on and awake.

```bash
uv sync --all-extras
brew install ffmpeg deno

cd bot && cp .env.example .env
deno task dev
```

Fine for a quick test; not a real deployment.

---

## Polling vs webhook

| Mode | When | Needs domain + HTTPS? |
|---|---|---|
| **Polling** (default) | VPS, Docker | No |
| **Webhook** | VPS + reverse proxy | Yes |

Set for webhook:

```env
BOT_PUBLIC_URL=https://bot.example.com
PORT=8787
```

Put Caddy/nginx in front with TLS; Telegram posts to `https://bot.example.com/webhook`.

For Oracle + Docker polling, **skip webhook** — easier and works well.

---

## Env checklist (production)

```env
TELEGRAM_BOT_TOKEN=123456:ABC...
VIFU_ROOT=/app          # inside Docker
MAX_VIDEO_MB=20
# ADMIN_CHAT_ID=123456789  # optional — DM you when someone new uses the bot
# BOT_PUBLIC_URL=       # unset = polling
```

---

## Limits & ops

- **RAM:** allow ≥1 GB (OpenCV + render peaks).
- **Disk:** temp videos in `bot/tmp/`; cleaned after each job.
- **Concurrency:** in-memory render queue — 1 active job, 3 total on Fly (configurable via env). One job per user; `/cancel` drops a queued job.
- **Updates:** push to `main` (auto-deploy) or `fly deploy -a vifu`

---

## Quick comparison

```text
Free 24/7 bot        →  Oracle + docker compose
Easiest managed      →  Fly.io (see Option D)
Last resort          →  Mac + deno task dev (polling, must stay on)
```
