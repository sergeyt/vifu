from __future__ import annotations

from enum import Enum


class PlayerLayout(str, Enum):
    """How to match detected players to player1 / player2."""

    LEFT_RIGHT = "left-right"
    TOP_BOTTOM = "top-bottom"

    def track_sort_key(self, center_x: float, center_y: float) -> float:
        """Lower sort key → player1 slot; higher → player2 slot."""
        if self is PlayerLayout.TOP_BOTTOM:
            return center_y
        return center_x

    def slot_label(self) -> str:
        if self is PlayerLayout.TOP_BOTTOM:
            return "top/bottom"
        return "left/right"
