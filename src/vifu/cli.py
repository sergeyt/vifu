from __future__ import annotations

from pathlib import Path
from typing import Annotated, Optional

import typer
from rich.console import Console

from vifu.layout import PlayerLayout
from vifu.pipeline import ProcessOptions, process_video

app = typer.Typer(
    name="vifu",
    help="vifu — video fun: arcade overlays for sport and competition clips.",
    no_args_is_help=True,
)
console = Console()


@app.callback()
def main() -> None:
    """Local CLI to make sport videos fun — HUD, health bars, fight intro, SFX."""


def _resolve_path(path: Path) -> Path:
    return path.expanduser().resolve()


@app.command()
def process(
    input: Annotated[
        Path,
        typer.Option("--input", "-i", help="Input video file.", exists=True, dir_okay=False),
    ],
    output: Annotated[
        Path,
        typer.Option("--output", "-o", help="Output video file."),
    ],
    player1: Annotated[
        str,
        typer.Option("--player1", help="Name for player 1."),
    ],
    player2: Annotated[
        str,
        typer.Option("--player2", help="Name for player 2."),
    ],
    layout: Annotated[
        PlayerLayout,
        typer.Option(
            "--layout",
            help="How to match players in frame: left-right (default) or top-bottom (vertical).",
            case_sensitive=False,
        ),
    ] = PlayerLayout.LEFT_RIGHT,
    style: Annotated[
        str,
        typer.Option("--style", help="Style preset name (YAML in configs/styles/)."),
    ] = "arcade_fight",
    start: Annotated[
        Optional[float],
        typer.Option("--start", help="Start time in seconds."),
    ] = None,
    duration: Annotated[
        Optional[float],
        typer.Option("--duration", help="Clip duration in seconds."),
    ] = None,
    max_duration: Annotated[
        Optional[float],
        typer.Option("--max-duration", help="Reject clips longer than this (seconds)."),
    ] = None,
    hit_times: Annotated[
        Optional[str],
        typer.Option("--hit-times", help="Comma-separated hit timestamps in seconds."),
    ] = None,
    auto_hit_sfx: Annotated[
        bool,
        typer.Option("--auto-hit-sfx", help="Detect hits and add impact SFX (requires hits_enabled)."),
    ] = False,
    no_hit_sfx: Annotated[
        bool,
        typer.Option(
            "--no-hit-sfx",
            help="Never add impact SFX; keep original paddle sounds (bell only).",
        ),
    ] = False,
    no_auto_hits: Annotated[
        bool,
        typer.Option(
            "--no-auto-hits",
            help="Do not auto-detect hits; health bars stay full unless --hit-times is set.",
        ),
    ] = False,
    debug: Annotated[
        bool,
        typer.Option("--debug", help="Show tracking boxes and frame info."),
    ] = False,
) -> None:
    """Process a video and add fight-style overlays."""
    input_path = _resolve_path(input)
    output_path = _resolve_path(output)

    if output_path == input_path:
        console.print("[red]Output path must differ from input path.[/red]")
        raise typer.Exit(code=1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    parsed_hits: list[float] | None = None
    if hit_times:
        try:
            parsed_hits = [float(t.strip()) for t in hit_times.split(",") if t.strip()]
        except ValueError:
            console.print("[red]Invalid --hit-times; use comma-separated seconds.[/red]")
            raise typer.Exit(code=1)

    options = ProcessOptions(
        input_path=input_path,
        output_path=output_path,
        player1=player1,
        player2=player2,
        layout=layout,
        style_name=style,
        start_sec=start,
        duration_sec=duration,
        max_duration_sec=max_duration,
        hit_times=parsed_hits,
        auto_hit_sfx=auto_hit_sfx,
        no_hit_sfx=no_hit_sfx,
        no_auto_hits=no_auto_hits,
        debug=debug,
    )

    console.print(f"[bold]Input:[/bold]  {input_path}")
    console.print(f"[bold]Output:[/bold] {output_path}")
    console.print(f"[bold]Style:[/bold]  {style}")
    console.print(f"[bold]Players:[/bold] {player1} vs {player2}")
    console.print(f"[bold]Layout:[/bold]  {layout.value} ({layout.slot_label()})")

    process_video(options, console=console)
    console.print(f"[green]Done:[/green] {output_path}")
