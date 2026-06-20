# vifu — Plan

**video fun**: local CLI for arcade-style sport competition videos.

## Goal

Turn short sport clips (table tennis, boxing gym, any head-to-head footage) into **fun fight-style videos** where two or more players compete:

- moving player names above each head (planned);
- top HUD with **reactive health bars** (smooth drain on rally hits);
- fight intro (`ROUND 1` → `FIGHT!`);
- SFX layer (bell by default; impacts opt-in);
- YAML style presets;
- fast iteration with **uv**.

Target command:

```bash
uv run vifu process \
  --input samples/rally_15s.mp4 \
  --output outputs/rally_fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --style arcade_fight \
  --auto-hit-sfx
```

**Player naming:** `--player1` / `--player2` (camera-agnostic). **`--layout`** matches detected people to slots:

| `--layout` | Use when |
|---|---|
| `left-right` (default) | Wide/side view — player1 = leftmost, player2 = rightmost |
| `top-bottom` | Vertical 9:16 — player1 = top, player2 = bottom |

HUD always shows player1 on the left bar and player2 on the right bar (MK style).

---

## Stack

| Area | Tool | Reason |
|---|---|---|
| Package manager | **uv** | Fast installs, lockfile, `uv run` |
| Language | Python 3.14 (3.12+) | Pinned via `.python-version`; latest stable with full wheel support |
| CLI | Typer | Typed options, good UX |
| Video I/O | OpenCV + FFmpeg | Frames in Python, audio mux via FFmpeg |
| Detection | Ultralytics YOLO | Person tracking out of the box |
| Overlays | OpenCV drawing | Local, no GPU compositor needed |
| Audio | FFmpeg + scipy | Mix SFX; detect hit peaks from waveform |
| Config | YAML + Pydantic | Style presets |

---

## Health Bar Model (v1)

Health is **visual drama** — player1 is the rally winner.

- Both start at **100%**.
- Hit times come from **audio auto-detection** (or `--hit-times`).
- Each hit drops **player2** evenly toward 0%; the **final hit** leaves player2 at **0%**.
- **Player1** drops slowly to `winner_end_percent` (default **28%**) by the final hit.
- Damage **eases in** over `drain_seconds` (default **0.35s**) after each hit — no instant jumps.
- Brief **bar flash** on impact (`flash_frames` in style YAML).
- No refill during rally (`refill_per_second: 0`).

Tune in `configs/styles/arcade_fight.yaml`:

```yaml
health:
  start_percent: 100
  winner_end_percent: 28
  loser_end_percent: 0
  drain_seconds: 0.35
  flash_frames: 3
```

---

## Project Layout

```text
vifu/
  plan.md
  pyproject.toml
  uv.lock
  .gitignore
  README.md
  samples/.gitkeep
  outputs/.gitkeep
  assets/sounds/.gitkeep
  assets/fonts/.gitkeep
  configs/styles/arcade_fight.yaml
  src/vifu/
    __init__.py
    __main__.py
    cli.py
    pipeline.py
    video_io.py
    detector.py
    tracker.py
    overlay.py
    audio.py
    styles.py
    health.py
  tests/test_styles.py
```

---

## Environment Setup (uv)

Prerequisites: [uv](https://docs.astral.sh/uv/) and FFmpeg.

```bash
brew install ffmpeg
cd vifu
uv sync                    # install deps from pyproject.toml
uv run vifu --help   # run CLI without activating a venv
```

Add a dependency later:

```bash
uv add ultralytics
```

Dev / test:

```bash
uv run pytest
uv run vifu process --input samples/short_5s.mp4 ...
```

---

## Core Pipeline

```text
load video (optional trim)
  -> YOLO person tracking
  -> pick player1/player2 tracks (--layout: left-right or top-bottom)
  -> smooth title positions
  -> compute health per frame from hit times
  -> draw floating names + MK HUD each frame
  -> write temp silent video
  -> mix original audio + SFX (FFmpeg)
  -> export final MP4
```

---

## Milestones

Track status: `[ ]` todo · `[~]` in progress · `[x]` done

### Phase 1 — Foundation

| # | Milestone | Status | Acceptance |
|---|---|---|---|
| M1 | CLI skeleton | [x] | `uv run vifu process --help` works |
| M2 | Video read/write | [x] | Copy input → output MP4, same fps/size |
| M3 | Style presets | [x] | Load `arcade_fight.yaml` via Pydantic |

**M1** — Typer app, `process` command, validation, Rich logging.

**M2** — `video_io.py`: open video, iterate frames, write MP4. Pipeline copies with frame counter (debug).

**M3** — `styles.py` + `configs/styles/arcade_fight.yaml`. HUD colors, fonts, health bar layout.

---

### Phase 2 — Fight Look

| # | Milestone | Status | Acceptance |
|---|---|---|---|
| M4 | YOLO tracking | [ ] | Boxes + track IDs on `--debug` |
| M5 | Left/right selection | [ ] | Two main players named correctly |
| M6 | Floating titles | [ ] | Smooth names above heads |
| M7 | MK HUD + health | [x] | Top bars drop over rally; P2 → 0% on final hit |

**M4** — `detector.py`: Ultralytics `yolo11n.pt`, `classes=[0]`, persist tracks.

**M5** — `tracker.py`: first 3–5s frequency + bbox size → pick two tracks, sort by `--layout` (x-center or y-center).

**M6** — `overlay.py`: shadow, colored badge, uppercase name, EMA smoothing.

**M7** — `health.py` + `draw_hud()`: red/blue bars, `ROUND 1` (0–1.5s), `FIGHT!` (1.5–2.5s), health from hit timeline.

---

### Phase 3 — Sound & Shorts

| # | Milestone | Status | Acceptance |
|---|---|---|---|
| M8 | Manual SFX | [x] | `--hit-times 1.2,2.7` mixes impacts |
| M9 | Auto hit detection | [x] | `--auto-hit-sfx` from audio peaks |
| M10 | Clip tools | [ ] | `--start`, `--duration`, `--debug` |

**M8** — `audio.py`: FFmpeg mix original + bell + hits. Health syncs to same timestamps.

**M9** — scipy STFT energy peaks, debounce ≥0.4s apart.

**M10** — Trim segment; debug mode shows boxes instead of polished overlay.

---

### Phase 4 — Polish (post-MVP)

| # | Milestone | Status | Notes |
|---|---|---|---|
| M11 | Vertical export | [ ] | `--vertical-crop` for 9:16 TikTok |
| M12 | Track overrides | [ ] | `--left-track-id`, `--right-track-id` |
| M13 | Extra presets | [ ] | `cyber_pingpong.yaml` |

---

## `arcade_fight` Style (reference)

```yaml
name: arcade_fight
smoothing_alpha: 0.35
player1:
  name_color_bgr: [255, 255, 255]
  bar_color_bgr: [40, 40, 220]
  subtitle: "PADDLE WARRIOR"
player2:
  name_color_bgr: [255, 255, 255]
  bar_color_bgr: [40, 220, 80]
  subtitle: "SPIN MASTER"
hud:
  enabled: true
  round_text: "ROUND 1"
  fight_text: "FIGHT!"
  intro_seconds: 2.5
  bar_height: 28
  bar_margin: 24
health:
  start_percent: 100
  hit_damage: 8
  refill_per_second: 2
  flash_frames: 3
sfx:
  enabled: true
  intro_sound: "assets/sounds/fight_bell.wav"
  hit_sound: "assets/sounds/impact_01.wav"
```

Use royalty-free SFX only — do not ship copyrighted game audio.

---

## Definition of Done (MVP)

```bash
uv run vifu process \
  --input samples/rally_15s.mp4 \
  --output outputs/rally_fight.mp4 \
  --player1 SERGEI \
  --player2 ALEX \
  --style arcade_fight \
  --auto-hit-sfx
```

Output must have:

- [ ] original video with moving player names;
- [ ] MK-style top health bars that drop on hits;
- [ ] `ROUND 1` / `FIGHT!` intro;
- [ ] mixed SFX + preserved original audio;
- [ ] no crashes on 15–30s clips;
- [ ] reasonable processing time on Mac.

---

## Dev Workflow

1. Implement **one milestone** at a time.
2. Test on `samples/short_5s.mp4` (5–10s).
3. Update milestone status in this file.
4. Commit when a milestone passes its acceptance test.

Cursor rule of thumb:

```text
Local Python CLI for vifu (video fun) sport overlays. uv + Typer + OpenCV + Ultralytics + FFmpeg. Working prototype over perfect architecture. One milestone per change.
```

---

## Known Hard Parts

| Issue | v1 approach |
|---|---|
| Tracker ID swaps | Assign slots by `--layout` (x or y average); manual track IDs later |
| Ball too small/fast | Audio spike detection, not vision |
| Background people | Pick two largest/frequent tracks in opening seconds |
| Mac speed | `yolo11n.pt`, short clips, full-res only when happy |

---

## Future (not MVP)

- Local Gradio UI
- Qwen-generated subtitles / trash talk
- Custom ball detector
- Wan/Hunyuan intro clips
- macOS app packaging
