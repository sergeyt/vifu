from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path

from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeElapsedColumn

from vifu.audio import detect_hit_times, ffmpeg_available, mix_audio
from vifu.health import health_at_time
from vifu.layout import PlayerLayout
from vifu.overlay import draw_hud
from vifu.styles import StyleConfig, load_style
from vifu.video_io import VideoReader, VideoWriter, draw_frame_label


@dataclass
class ProcessOptions:
    input_path: Path
    output_path: Path
    player1: str
    player2: str
    layout: PlayerLayout = PlayerLayout.LEFT_RIGHT
    style_name: str = "arcade_fight"
    start_sec: float | None = None
    duration_sec: float | None = None
    hit_times: list[float] | None = None
    auto_hit_sfx: bool = False
    no_hit_sfx: bool = False
    no_auto_hits: bool = False
    debug: bool = False


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _hits_enabled(options: ProcessOptions, style: StyleConfig) -> bool:
    if options.no_hit_sfx:
        return False
    if options.hit_times is not None or options.auto_hit_sfx:
        return True
    return style.sfx.hits_enabled


def _resolve_rally_hit_times(options: ProcessOptions, log: Console) -> list[float]:
    """Hit timestamps for health bars (auto-detect from audio by default)."""
    if options.hit_times is not None:
        return sorted(options.hit_times)

    if options.no_auto_hits:
        return []

    if not ffmpeg_available():
        log.print("[yellow]ffmpeg not found — health bars stay full (no hit detection).[/yellow]")
        return []

    hits = detect_hit_times(
        options.input_path,
        start_sec=options.start_sec or 0.0,
        duration_sec=options.duration_sec,
    )
    log.print(
        f"[dim]Rally hits for health:[/dim] {len(hits)} "
        f"({', '.join(f'{t:.2f}s' for t in hits) or 'none'})"
    )
    return hits


def _resolve_hit_times_for_sfx(
    options: ProcessOptions,
    style: StyleConfig,
    log: Console,
    rally_hits: list[float],
) -> list[float]:
    if not _hits_enabled(options, style):
        if options.auto_hit_sfx and not style.sfx.hits_enabled:
            log.print("[dim]Hit SFX disabled — keeping video's natural hits (bell only).[/dim]")
        return []
    return rally_hits


def process_video(options: ProcessOptions, console: Console | None = None) -> None:
    """Render overlays, then mux original audio + optional SFX."""
    log = console or Console()
    root = _project_root()
    style = load_style(options.style_name, root=root)
    start_sec = options.start_sec or 0.0

    rally_hits = _resolve_rally_hit_times(options, log)

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        silent_video = Path(tmp.name)

    try:
        with VideoReader(
            options.input_path,
            start_sec=options.start_sec,
            duration_sec=options.duration_sec,
        ) as reader:
            log.print(
                f"Video: {reader.width}x{reader.height} @ {reader.fps:.2f} fps, "
                f"{reader.frame_count} frames"
            )

            with VideoWriter(
                silent_video,
                fps=reader.fps,
                width=reader.width,
                height=reader.height,
            ) as writer:
                progress = Progress(
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("{task.completed}/{task.total}"),
                    TimeElapsedColumn(),
                    console=log,
                )
                task_id = progress.add_task("Rendering", total=reader.frame_count)

                with progress:
                    for frame_index, frame in reader.iter_frames():
                        elapsed = frame_index / reader.fps if reader.fps > 0 else 0.0
                        snapshot = health_at_time(
                            elapsed,
                            rally_hits,
                            health=style.health,
                            fps=reader.fps,
                        )

                        if options.debug:
                            label = (
                                f"F{frame_index} | {options.player1} vs {options.player2} "
                                f"| P1 {snapshot.player1:.0f}% P2 {snapshot.player2:.0f}% "
                                f"[{options.layout.value}]"
                            )
                            draw_frame_label(frame, label, origin=(12, 36))

                        draw_hud(
                            frame,
                            style=style,
                            player1=options.player1,
                            player2=options.player2,
                            elapsed_sec=elapsed,
                            health=snapshot,
                        )
                        writer.write(frame)
                        progress.advance(task_id)

        sfx_hits = _resolve_hit_times_for_sfx(options, style, log, rally_hits)
        mix_style = style.model_copy(
            update={
                "sfx": style.sfx.model_copy(
                    update={"hits_enabled": _hits_enabled(options, style)}
                )
            }
        )

        if ffmpeg_available():
            mix_audio(
                source_video=options.input_path,
                rendered_video=silent_video,
                output_path=options.output_path,
                style=mix_style,
                hit_times=sfx_hits,
                root=root,
                start_sec=start_sec,
                duration_sec=options.duration_sec,
                console=log,
            )
        else:
            log.print(
                "[yellow]ffmpeg not found — output is silent. "
                "Install: brew install ffmpeg[/yellow]"
            )
            silent_video.replace(options.output_path)
    finally:
        silent_video.unlink(missing_ok=True)
