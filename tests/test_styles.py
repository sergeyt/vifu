from pathlib import Path

from tt_overlay.styles import StyleConfig, load_style


def test_load_arcade_fight_style() -> None:
    root = Path(__file__).resolve().parents[1]
    style = load_style("arcade_fight", root=root)
    assert style.name == "arcade_fight"
    assert style.hud.round_text == "ROUND 1"
    assert style.health.winner_end_percent == 28.0
    assert style.player1.subtitle == "PADDLE WARRIOR"


def test_arcade_fight_bell_only_by_default() -> None:
    root = Path(__file__).resolve().parents[1]
    style = load_style("arcade_fight", root=root)
    assert style.sfx.enabled is True
    assert style.sfx.intro_enabled is True
    assert style.sfx.hits_enabled is False


def test_style_defaults() -> None:
    style = StyleConfig()
    assert style.hud.enabled is True
    assert style.health.start_percent == 100.0
    assert style.sfx.hits_enabled is False
