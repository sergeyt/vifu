from __future__ import annotations

import cv2

from vifu.health import HealthSnapshot
from vifu.styles import StyleConfig


def draw_hud(
    frame,
    *,
    style: StyleConfig,
    player1: str,
    player2: str,
    elapsed_sec: float,
    health: HealthSnapshot,
) -> None:
    if not style.hud.enabled:
        return

    h, w = frame.shape[:2]
    margin = style.hud.bar_margin
    bar_h = style.hud.bar_height
    bar_w = w // 2 - margin * 2
    y = margin

    p1_color = tuple(style.player1.bar_color_bgr)
    p2_color = tuple(style.player2.bar_color_bgr)
    flash = health.flash

    _draw_named_health_bar(
        frame,
        x=margin,
        y=y,
        width=bar_w,
        height=bar_h,
        name=player1,
        percent=health.player1,
        fill_color=p1_color,
        flash=flash,
    )
    _draw_named_health_bar(
        frame,
        x=w - margin - bar_w,
        y=y,
        width=bar_w,
        height=bar_h,
        name=player2,
        name_align="right",
        percent=health.player2,
        fill_color=p2_color,
        flash=flash,
    )

    intro_end = style.hud.intro_seconds
    if elapsed_sec < intro_end:
        font = cv2.FONT_HERSHEY_DUPLEX
        text = style.hud.round_text if elapsed_sec < intro_end * 0.6 else style.hud.fight_text
        text_size, _ = cv2.getTextSize(text, font, 1.4, 3)
        tx = (w - text_size[0]) // 2
        ty = h // 2
        cv2.putText(frame, text, (tx + 2, ty + 2), font, 1.4, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, text, (tx, ty), font, 1.4, (40, 220, 255), 3, cv2.LINE_AA)


def _draw_named_health_bar(
    frame,
    *,
    x: int,
    y: int,
    width: int,
    height: int,
    name: str,
    percent: float,
    fill_color: tuple[int, int, int],
    name_align: str = "left",
    flash: bool = False,
) -> None:
    bg = (30, 30, 30)
    cv2.rectangle(frame, (x, y), (x + width, y + height), bg, -1)

    fill_w = max(0, int(round(width * max(0.0, min(100.0, percent)) / 100.0)))
    if fill_w > 0:
        color = (255, 255, 255) if flash else fill_color
        cv2.rectangle(frame, (x, y), (x + fill_w, y + height), color, -1)

    cv2.rectangle(frame, (x, y), (x + width, y + height), (10, 10, 10), 1)

    font = cv2.FONT_HERSHEY_DUPLEX
    scale = 0.55
    thickness = 1
    label = name.upper()
    text_size, _ = cv2.getTextSize(label, font, scale, thickness)
    text_y = y + height - 8
    if name_align == "right":
        text_x = x + width - text_size[0] - 8
    else:
        text_x = x + 8
    cv2.putText(frame, label, (text_x, text_y), font, scale, (255, 255, 255), thickness, cv2.LINE_AA)
