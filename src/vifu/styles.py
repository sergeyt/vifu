from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class PlayerStyle(BaseModel):
    name_color_bgr: list[int] = Field(default_factory=lambda: [255, 255, 255])
    bar_color_bgr: list[int] = Field(default_factory=lambda: [40, 40, 220])
    subtitle: str = ""


class HudStyle(BaseModel):
    enabled: bool = True
    round_text: str = "ROUND 1"
    fight_text: str = "FIGHT!"
    intro_seconds: float = 2.5
    bar_height: int = 28
    bar_margin: int = 24


class HealthStyle(BaseModel):
    start_percent: float = 100.0
    winner_end_percent: float = 28.0
    loser_end_percent: float = 0.0
    drain_seconds: float = 0.35
    hit_damage: float = 8.0
    refill_per_second: float = 0.0
    flash_frames: int = 3


class SfxStyle(BaseModel):
    enabled: bool = True
    intro_enabled: bool = True
    hits_enabled: bool = False
    intro_sound: str = "assets/sounds/fight_bell.wav"
    hit_sound: str = "assets/sounds/impact_01.wav"


class StyleConfig(BaseModel):
    name: str = "arcade_fight"
    smoothing_alpha: float = 0.35
    font_scale: float = 0.9
    font_thickness: int = 2
    title_padding_x: int = 14
    title_padding_y: int = 8
    title_offset_y: int = 38
    player1: PlayerStyle = Field(default_factory=PlayerStyle)
    player2: PlayerStyle = Field(
        default_factory=lambda: PlayerStyle(bar_color_bgr=[40, 220, 80])
    )
    hud: HudStyle = Field(default_factory=HudStyle)
    health: HealthStyle = Field(default_factory=HealthStyle)
    sfx: SfxStyle = Field(default_factory=SfxStyle)


def style_config_path(name: str, root: Path | None = None) -> Path:
    base = root or Path.cwd()
    return base / "configs" / "styles" / f"{name}.yaml"


def load_style(name: str, root: Path | None = None) -> StyleConfig:
    path = style_config_path(name, root=root)
    if not path.is_file():
        raise FileNotFoundError(f"Style preset not found: {path}")
    data = yaml.safe_load(path.read_text()) or {}
    return StyleConfig.model_validate(data)
