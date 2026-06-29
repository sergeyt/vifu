from pathlib import Path

import pytest

from vifu.video_io import (
    assert_max_duration,
    clip_output_path,
    cut_video,
    probe_duration_sec,
    validate_trim_range,
)


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


def test_clip_output_path() -> None:
    assert clip_output_path(Path("samples/rally.mp4")) == Path("samples/rally-clip.mp4")
    assert clip_output_path(Path("/tmp/foo.MOV")) == Path("/tmp/foo-clip.MOV")


def test_cut_video_calls_ffmpeg(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    captured: list[list[str]] = []

    def fake_run(args: list[str]) -> None:
        captured.append(args)

    monkeypatch.setattr("vifu.audio.ffmpeg_available", lambda: True)
    monkeypatch.setattr("vifu.audio._run_ffmpeg", fake_run)

    input_path = tmp_path / "long.mp4"
    input_path.write_bytes(b"fake")
    output_path = tmp_path / "long-clip.mp4"

    result = cut_video(input_path, output_path, start_sec=12.0, duration_sec=8.5)

    assert result == output_path
    assert captured == [
        [
            "-ss",
            "12.0",
            "-i",
            str(input_path),
            "-t",
            "8.5",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            str(output_path),
        ]
    ]


def test_cut_video_requires_ffmpeg(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("vifu.audio.ffmpeg_available", lambda: False)
    with pytest.raises(RuntimeError, match="ffmpeg is required"):
        cut_video(tmp_path / "in.mp4", tmp_path / "out.mp4")


def test_validate_trim_range_rejects_start_past_end() -> None:
    with pytest.raises(ValueError, match="past the end"):
        validate_trim_range(
            Path("clip.mp4"),
            start_sec=34.0,
            duration_sec=8.0,
            total_duration_sec=10.0,
        )


def test_validate_trim_range_allows_valid_window() -> None:
    validate_trim_range(
        Path("clip.mp4"),
        start_sec=34.0,
        duration_sec=8.0,
        total_duration_sec=60.0,
    )


def test_probe_duration_missing_file() -> None:
    with pytest.raises(FileNotFoundError):
        probe_duration_sec(Path("/nonexistent/video.mp4"))
