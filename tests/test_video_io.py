from pathlib import Path

import pytest

from vifu.video_io import assert_max_duration, probe_duration_sec


def test_assert_max_duration_rejects_long_clip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "vifu.video_io.probe_duration_sec",
        lambda _path: 45.0,
    )
    with pytest.raises(ValueError, match="45.0s"):
        assert_max_duration(Path("clip.mp4"), 30.0)


def test_assert_max_duration_allows_short_clip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "vifu.video_io.probe_duration_sec",
        lambda _path: 12.5,
    )
    assert_max_duration(Path("clip.mp4"), 30.0)


def test_probe_duration_missing_file() -> None:
    with pytest.raises(FileNotFoundError):
        probe_duration_sec(Path("/nonexistent/video.mp4"))
