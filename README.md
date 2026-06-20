# vifu

**video fun** — a local CLI that turns sport and competition clips into arcade-style fight videos. Two or more players, reactive health bars, fight intro, and optional SFX. Built for table tennis, but works for any head-to-head sport footage.

## Overview

**Input:** a short clip (`.mp4`) and player names (`--player1`, `--player2`, …).  
**Output:** the same video with game overlays baked in, original audio preserved.

```
video in  →  detect/track players  →  draw HUD + names  →  mix audio  →  video out
                  (planned)              (health ✓)          (bell ✓)
```

### What it does today

| Feature | Status |
|---|---|
| CLI + `./run.sh` fast re-run | ✓ |
| Video read/write, style presets | ✓ |
| Top HUD — reactive health bars, `ROUND 1` / `FIGHT!` | ✓ |
| Audio — original track + fight bell | ✓ |
| Impact SFX on hits | opt-in (`hits_enabled: false` by default) |
| YOLO player tracking + floating names | planned (M4–M6) |

### How it works

1. **Render** — OpenCV draws overlays frame-by-frame into a silent temp video.
2. **Health** — paddle/rally hits are detected from audio; bars drain smoothly (player1 wins, player2 → 0%).
3. **Audio** — FFmpeg muxes original audio plus an optional fight bell at `0:00`.
4. **Style** — `configs/styles/arcade_fight.yaml` controls colors, intro text, and SFX toggles.

### Design choices

- **Local-first** — Python + OpenCV + FFmpeg + uv; no cloud APIs.
- **Sport-agnostic** — name your players; use `--layout left-right|top-bottom` to match camera angle.
- **Natural sound** — bell only by default; your clip keeps its own hit sounds.
- **Fun, not franchise** — arcade fight *vibe* with royalty-free SFX ([sources](assets/sounds/SOURCES.md)).

Roadmap: [plan.md](plan.md).

## Setup

Requires **Python 3.14** (pinned in `.python-version`; supported range 3.12–3.14).

```bash
brew install ffmpeg direnv
curl -LsSf https://astral.sh/uv/install.sh | sh   # if needed

echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc   # once; see https://direnv.net/docs/hook.html

cd vifu
uv sync --all-extras
direnv allow
cp .envrc.local.example .envrc.local   # optional: default clip/names
```

## Fast re-run

```bash
./run.sh
```

Override any default for one shot:

```bash
INPUT=samples/my_clip.mp4 PLAYER1=ME ./run.sh
INPUT=samples/my_clip.mp4 ./run.sh --debug
LAYOUT=top-bottom ./run.sh
AUTO_HIT_SFX=1 ./run.sh
HIT_TIMES="1.2,2.7,4.1" ./run.sh
```

## Sound layer

Requires **ffmpeg**. Default mix: **original audio + fight bell** (no extra impacts).

```bash
./run.sh                              # bell only
AUTO_HIT_SFX=1 ./run.sh               # opt-in impact SFX
HIT_TIMES="1.2,2.7" ./run.sh          # manual hit timestamps
```

See [assets/sounds/SOURCES.md](assets/sounds/SOURCES.md) for bundled test samples.

```yaml
# configs/styles/arcade_fight.yaml
sfx:
  enabled: true
  intro_enabled: true
  hits_enabled: false
```

## Usage

```bash
uv run vifu process \
  --input samples/rally.mp4 \
  --output outputs/fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --style arcade_fight
```

Vertical shorts (players stacked top/bottom):

```bash
uv run vifu process \
  --input samples/vertical.mp4 \
  --output outputs/fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --layout top-bottom \
  --style arcade_fight
```

`--layout` matches detected people to `--player1` / `--player2` (default: `left-right`).

## Telegram bot

Simple Deno bot in [`bot/`](bot/): send video → `PLAYER1 vs PLAYER2` → get fight clip.

```bash
cd bot && cp .env.example .env   # TELEGRAM_BOT_TOKEN
deno task dev
```

See [bot/README.md](bot/README.md).

Roadmap: [plan.md](plan.md).
