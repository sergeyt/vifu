from pathlib import Path

from tt_overlay.audio import _write_placeholder_wav, ensure_default_sounds
from tt_overlay.styles import StyleConfig, SfxStyle


def test_ensure_default_sounds_creates_intro_only(tmp_path: Path) -> None:
    style = StyleConfig(
        sfx=SfxStyle(
            enabled=True,
            intro_enabled=True,
            hits_enabled=False,
            intro_sound="assets/sounds/fight_bell.wav",
            hit_sound="assets/sounds/impact_01.wav",
        )
    )
    intro, hit = ensure_default_sounds(style, root=tmp_path)
    assert intro is not None and intro.is_file()
    assert hit is None


def test_ensure_default_sounds_creates_both(tmp_path: Path) -> None:
    style = StyleConfig(
        sfx=SfxStyle(
            enabled=True,
            intro_enabled=True,
            hits_enabled=True,
            intro_sound="assets/sounds/fight_bell.wav",
            hit_sound="assets/sounds/impact_01.wav",
        )
    )
    intro, hit = ensure_default_sounds(style, root=tmp_path)
    assert intro is not None and intro.is_file()
    assert hit is not None and hit.is_file()


def test_placeholder_wav_is_non_empty(tmp_path: Path) -> None:
    path = tmp_path / "beep.wav"
    _write_placeholder_wav(path, frequency=440.0, duration=0.1, decay=True)
    assert path.stat().st_size > 100
