# tt-vid

Local CLI that turns short table-tennis clips into **arcade fight-style videos** — MK-inspired HUD, player names, fight intro, and optional SFX. Everything runs on your Mac; no cloud APIs.

## Overview

**Input:** a short rally clip (`.mp4`) and two player names.  
**Output:** the same video with game overlays baked in, original audio preserved.

```
video in  →  detect/track players  →  draw HUD + names  →  mix audio  →  video out
                  (planned)              (partial)           (bell ✓)
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
| Reactive health bars | ✓ (auto-detect hits from audio) |

### How it works

1. **Render** — OpenCV draws overlays frame-by-frame into a silent temp video.
2. **Audio** — FFmpeg muxes your clip's original audio plus an optional fight bell at `0:00`. Extra hit SFX are off by default so natural paddle sounds stay intact.
3. **Style** — `configs/styles/arcade_fight.yaml` controls colors, intro text, and SFX toggles.

### Design choices

- **Local-first** — Python + OpenCV + FFmpeg + uv; runs entirely on your machine.
- **Camera-agnostic** — `--player1` / `--player2` with optional `--layout left-right|top-bottom` to match people in frame.
- **Bell only by default** — one fight bell on top of your video's own hit sounds; impact SFX are opt-in.
- **MK-inspired, not MK assets** — generic fight UI + royalty-free sounds (see [assets/sounds/SOURCES.md](assets/sounds/SOURCES.md)).

Roadmap and milestone detail: [plan.md](plan.md).

## Setup

Requires **Python 3.14** (pinned in `.python-version`; supported range 3.12–3.14). Verified with OpenCV, Ultralytics, and SciPy wheels.

```bash
brew install ffmpeg direnv
curl -LsSf https://astral.sh/uv/install.sh | sh   # if needed

# hook direnv into your shell (once): see https://direnv.net/docs/hook.html
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc

cd tt-vid
uv sync --all-extras   # installs Python 3.14 via uv if needed
direnv allow           # auto-runs uv sync, activates .venv
cp .envrc.local.example .envrc.local   # optional: your default clip/names
```

## Fast re-run

After `direnv allow`, edit `.envrc.local` with your sample path and names, then:

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

Requires **ffmpeg** (`brew install ffmpeg`). The pipeline renders video, then mixes:

1. **Original audio** from your clip
2. **Fight bell** at start (`assets/sounds/fight_bell.wav`)
3. **Impact SFX** on each hit (`assets/sounds/impact_01.wav`)

Drop your own royalty-free WAVs in `assets/sounds/` (same filenames), or use the **bundled test samples** — see [assets/sounds/SOURCES.md](assets/sounds/SOURCES.md).

**Auto-detect hits** from paddle sounds in the video:

```bash
AUTO_HIT_SFX=1 ./run.sh
# or
uv run tt-overlay process ... --auto-hit-sfx
```

**Manual hit timestamps** (seconds):

```bash
HIT_TIMES="1.2,2.7,4.1" ./run.sh
# or
uv run tt-overlay process ... --hit-times "1.2,2.7,4.1"
```

```yaml
sfx:
  enabled: true
  intro_enabled: true   # fight bell at start
  hits_enabled: false   # keep video's natural paddle hits
  intro_sound: "assets/sounds/fight_bell.wav"
  hit_sound: "assets/sounds/impact_01.wav"
```

**Bell only (default)** — original audio + fight bell, no extra impacts:

```bash
./run.sh
```

**Opt-in hit SFX** when you want them:

```bash
AUTO_HIT_SFX=1 ./run.sh
HIT_TIMES="1.2,2.7" ./run.sh
# or set hits_enabled: true in the YAML
```

## Usage

```bash
uv run tt-overlay process \
  --input samples/rally_15s.mp4 \
  --output outputs/rally_fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --style arcade_fight
```

For vertical shorts where players stack top/bottom in frame:

```bash
uv run tt-overlay process \
  --input samples/vertical_rally.mp4 \
  --output outputs/rally_fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --layout top-bottom \
  --style arcade_fight
```

`--layout` controls how detected players are matched to `--player1` / `--player2` (default: `left-right`).

See [plan.md](plan.md) for milestones and roadmap.
