from __future__ import annotations

import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from rich.console import Console

from vifu.styles import StyleConfig


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = result.stderr.strip() or "unknown ffmpeg error"
        raise RuntimeError(f"ffmpeg failed: {detail}")


def _resolve_asset(path: str, root: Path) -> Path:
    candidate = Path(path)
    if candidate.is_file():
        return candidate
    rooted = root / path
    if rooted.is_file():
        return rooted
    return rooted


def ensure_default_sounds(
    style: StyleConfig, root: Path
) -> tuple[Path | None, Path | None]:
    """Ensure intro/hit WAVs exist when those layers are enabled."""
    intro: Path | None = None
    hit: Path | None = None

    if style.sfx.enabled and style.sfx.intro_enabled:
        intro = _resolve_asset(style.sfx.intro_sound, root)
        if not intro.is_file():
            _write_placeholder_wav(intro, frequency=880.0, duration=0.35, decay=True)

    if style.sfx.enabled and style.sfx.hits_enabled:
        hit = _resolve_asset(style.sfx.hit_sound, root)
        if not hit.is_file():
            _write_placeholder_wav(hit, frequency=220.0, duration=0.12, decay=True)

    return intro, hit


def _write_placeholder_wav(path: Path, *, frequency: float, duration: float, decay: bool) -> None:
    """Procedural beep — replace with real royalty-free SFX in assets/sounds/."""
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 44_100
    samples = int(sample_rate * duration)
    t = np.linspace(0.0, duration, samples, endpoint=False)
    envelope = np.exp(-t * 10.0) if decay else np.ones_like(t)
    waveform = np.sin(2.0 * np.pi * frequency * t) * envelope * 0.45
    pcm = (waveform * 32_767).astype(np.int16)

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())


def detect_hit_times(
    video_path: Path,
    *,
    start_sec: float = 0.0,
    duration_sec: float | None = None,
    min_gap_sec: float = 0.4,
    threshold_factor: float = 2.8,
) -> list[float]:
    """Detect paddle-hit-like peaks from the video's audio track."""
    try:
        from scipy.io import wavfile
    except ImportError as exc:
        raise RuntimeError("Install audio extras: uv sync --extra audio") from exc

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)

    try:
        extract_args = ["-ss", str(start_sec)]
        if duration_sec is not None:
            extract_args.extend(["-t", str(duration_sec)])
        extract_args.extend(
            ["-i", str(video_path), "-vn", "-ac", "1", "-ar", "44100", str(wav_path)]
        )
        _run_ffmpeg(extract_args)

        sample_rate, data = wavfile.read(wav_path)
        if data.ndim > 1:
            data = data.mean(axis=1)
        data = data.astype(np.float64)
        if data.size == 0:
            return []

        window = max(1, int(sample_rate * 0.02))
        squared = data**2
        kernel = np.ones(window) / window
        energy = np.convolve(squared, kernel, mode="same")
        baseline = float(np.median(energy)) or 1.0
        threshold = baseline * threshold_factor

        min_samples = int(min_gap_sec * sample_rate)
        hits: list[float] = []
        last_hit_sample = -min_samples

        for index in range(1, len(energy) - 1):
            if energy[index] < threshold:
                continue
            if not (energy[index] >= energy[index - 1] and energy[index] >= energy[index + 1]):
                continue
            if index - last_hit_sample < min_samples:
                if hits and energy[index] > energy[int(last_hit_sample)]:
                    hits[-1] = index / sample_rate
                    last_hit_sample = index
                continue
            hits.append(index / sample_rate)
            last_hit_sample = index

        return hits
    finally:
        wav_path.unlink(missing_ok=True)


def mix_audio(
    *,
    source_video: Path,
    rendered_video: Path,
    output_path: Path,
    style: StyleConfig,
    hit_times: list[float],
    root: Path,
    start_sec: float = 0.0,
    duration_sec: float | None = None,
    console: Console | None = None,
) -> None:
    """Mux original audio + optional SFX onto the rendered silent video."""
    log = console or Console()

    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is required for audio. Install: brew install ffmpeg")

    intro_path: Path | None = None
    hit_path: Path | None = None
    if style.sfx.enabled:
        intro_path, hit_path = ensure_default_sounds(style, root)

    args: list[str] = ["-i", str(rendered_video)]

    source_args = ["-ss", str(start_sec), "-i", str(source_video)]
    if duration_sec is not None:
        source_args.insert(2, "-t")
        source_args.insert(3, str(duration_sec))
    args.extend(source_args)

    sfx_inputs: list[tuple[Path, float, float]] = []
    if style.sfx.enabled and style.sfx.intro_enabled and intro_path and intro_path.is_file():
        sfx_inputs.append((intro_path, 0.0, 0.7))
    if style.sfx.enabled and style.sfx.hits_enabled and hit_path and hit_path.is_file():
        for timestamp in hit_times:
            sfx_inputs.append((hit_path, max(0.0, timestamp), 0.85))

    for sfx_path, _, _ in sfx_inputs:
        args.extend(["-i", str(sfx_path)])

    if sfx_inputs:
        filter_parts: list[str] = ["[1:a]volume=1[orig]"]
        mix_labels = ["[orig]"]
        for index, (_, delay_sec, volume) in enumerate(sfx_inputs):
            input_index = 2 + index
            delay_ms = int(delay_sec * 1000)
            label = f"sfx{index}"
            filter_parts.append(
                f"[{input_index}:a]adelay={delay_ms}|{delay_ms},volume={volume}[{label}]"
            )
            mix_labels.append(f"[{label}]")
        filter_parts.append(
            f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:dropout_transition=0[aout]"
        )
        args.extend(
            [
                "-filter_complex",
                ";".join(filter_parts),
                "-map",
                "0:v:0",
                "-map",
                "[aout]",
            ]
        )
    else:
        args.extend(["-map", "0:v:0", "-map", "1:a:0?"])

    args.extend(
        [
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            str(output_path),
        ]
    )

    _run_ffmpeg(args)
    if sfx_inputs:
        hit_count = len(hit_times) if style.sfx.hits_enabled else 0
        if hit_count:
            log.print(
                f"[dim]Audio:[/dim] original + bell + {hit_count} hit SFX"
            )
        else:
            log.print("[dim]Audio:[/dim] original + fight bell")
    else:
        log.print("[dim]Audio:[/dim] original track copied")
