from __future__ import annotations

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
        total_frames = int(self._capture.get(cv2.CAP_PROP_FRAME_COUNT))

        start_frame = int(self._start_sec * self.fps)
        if start_frame > 0:
            self._capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        if self._duration_sec is not None:
            self.frame_count = min(int(self._duration_sec * self.fps), total_frames - start_frame)
        else:
            self.frame_count = max(0, total_frames - start_frame)

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


def probe_duration_sec(path: Path) -> float:
    """Return video length in seconds."""
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
