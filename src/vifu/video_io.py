from __future__ import annotations

import shutil
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class VideoMeta:
    path: Path
    fps: float
    width: int
    height: int
    frame_count: int
    fourcc: str


class VideoReader:
    def __init__(
        self,
        path: Path,
        *,
        start_sec: float | None = None,
        duration_sec: float | None = None,
    ) -> None:
        self.path = path
        self._start_sec = start_sec or 0.0
        self._duration_sec = duration_sec
        self._capture = cv2.VideoCapture(str(path))
        if not self._capture.isOpened():
            raise FileNotFoundError(f"Cannot open video: {path}")

        self.fps = float(self._capture.get(cv2.CAP_PROP_FPS) or 30.0)
        self.width = int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        reported_frames = int(self._capture.get(cv2.CAP_PROP_FRAME_COUNT))
        total_duration = probe_duration_sec(path)
        duration_frames = int(total_duration * self.fps) if total_duration > 0 else 0
        total_frames = max(reported_frames, duration_frames)

        start_frame = int(self._start_sec * self.fps)
        if self._start_sec > 0 or self._duration_sec is not None:
            validate_trim_range(
                path,
                start_sec=self._start_sec,
                duration_sec=self._duration_sec,
                total_duration_sec=total_duration,
            )

        if start_frame > 0:
            self._capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        available_frames = max(0, total_frames - start_frame)
        if self._duration_sec is not None:
            self.frame_count = min(int(self._duration_sec * self.fps), available_frames)
        else:
            self.frame_count = available_frames

        self._start_frame = start_frame
        self._frames_read = 0

    def __enter__(self) -> VideoReader:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def close(self) -> None:
        self._capture.release()

    def iter_frames(self) -> Iterator[tuple[int, np.ndarray]]:
        while self._frames_read < self.frame_count:
            ok, frame = self._capture.read()
            if not ok:
                break
            frame_index = self._start_frame + self._frames_read
            self._frames_read += 1
            yield frame_index, frame


def _probe_duration_ffprobe(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        raise RuntimeError("ffprobe not found")

    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = result.stderr.strip() or "unknown ffprobe error"
        raise RuntimeError(f"ffprobe failed: {detail}")

    duration = float(result.stdout.strip())
    if duration <= 0:
        raise RuntimeError(f"ffprobe returned invalid duration for {path}")
    return duration


def probe_duration_sec(path: Path) -> float:
    """Return video length in seconds (ffprobe when available, else OpenCV)."""
    if shutil.which("ffprobe") is not None:
        try:
            return _probe_duration_ffprobe(path)
        except RuntimeError:
            pass

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise FileNotFoundError(f"Cannot open video: {path}")
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if fps <= 0 or frame_count <= 0:
            return 0.0
        return frame_count / fps
    finally:
        capture.release()


def validate_trim_range(
    path: Path,
    *,
    start_sec: float,
    duration_sec: float | None,
    total_duration_sec: float | None = None,
) -> None:
    """Reject trim windows that start past the end or leave no frames."""
    total = total_duration_sec if total_duration_sec is not None else probe_duration_sec(path)
    if start_sec >= total - 0.05:
        raise ValueError(
            f"--start {start_sec:g}s is past the end of {path.name} ({total:.1f}s). "
            "Check --input and --start."
        )

    end_sec = start_sec + duration_sec if duration_sec is not None else total
    if end_sec - start_sec <= 0.05:
        raise ValueError(
            f"Trim window ({start_sec:g}s–{end_sec:g}s) is empty for {path.name} ({total:.1f}s)."
        )


def clip_output_path(path: Path) -> Path:
    """Path for a trimmed copy: ``rally.mp4`` → ``rally-clip.mp4``."""
    return path.with_name(f"{path.stem}-clip{path.suffix}")


def cut_video(
    input_path: Path,
    output_path: Path,
    *,
    start_sec: float = 0.0,
    duration_sec: float | None = None,
) -> Path:
    """Extract a segment with ffmpeg (stream copy). Requires ffmpeg on PATH."""
    from vifu.audio import _run_ffmpeg, ffmpeg_available

    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is required to cut clips. Install: brew install ffmpeg")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    args: list[str] = []
    if start_sec > 0:
        args.extend(["-ss", str(start_sec)])
    args.extend(["-i", str(input_path)])
    if duration_sec is not None:
        args.extend(["-t", str(duration_sec)])
    args.extend(
        [
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            str(output_path),
        ]
    )
    _run_ffmpeg(args)
    return output_path


def assert_max_duration(path: Path, max_sec: float) -> None:
    duration = probe_duration_sec(path)
    if duration > max_sec + 0.05:
        raise ValueError(
            f"Video is {duration:.1f}s — max allowed is {max_sec:.0f}s. "
            "Send a shorter clip."
        )


class VideoWriter:
    def __init__(self, path: Path, *, fps: float, width: int, height: int) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self._writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
        if not self._writer.isOpened():
            raise RuntimeError(f"Cannot open video writer: {path}")

    def __enter__(self) -> VideoWriter:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def write(self, frame: np.ndarray) -> None:
        self._writer.write(frame)

    def close(self) -> None:
        self._writer.release()


def draw_frame_label(
    frame: np.ndarray,
    text: str,
    *,
    origin: tuple[int, int] = (12, 36),
    scale: float = 0.8,
    color: tuple[int, int, int] = (0, 255, 0),
) -> None:
    cv2.putText(
        frame,
        text,
        origin,
        cv2.FONT_HERSHEY_SIMPLEX,
        scale,
        color,
        2,
        cv2.LINE_AA,
    )
