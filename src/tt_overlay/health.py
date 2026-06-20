from __future__ import annotations

from dataclasses import dataclass

from tt_overlay.styles import HealthStyle


@dataclass(frozen=True)
class HealthSnapshot:
    player1: float
    player2: float
    flash: bool


def _ease_out_cubic(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def _target_after_hit(hit_index: int, total_hits: int, health: HealthStyle) -> tuple[float, float]:
    progress = hit_index / total_hits
    player2 = health.loser_end_percent if hit_index >= total_hits else health.start_percent * (1.0 - progress)
    winner_drop = health.start_percent - health.winner_end_percent
    player1 = max(health.winner_end_percent, health.start_percent - winner_drop * progress)
    return player1, player2


def health_at_time(
    elapsed_sec: float,
    hit_times: list[float],
    *,
    health: HealthStyle,
    fps: float,
) -> HealthSnapshot:
    """Compute smoothed health percents at a point in the clip.

    After each hit, bars ease toward their new level over ``drain_seconds``.
    Player1 is the rally winner; player2 reaches 0% after the final hit.
    """
    if not hit_times:
        start = health.start_percent
        return HealthSnapshot(player1=start, player2=start, flash=False)

    hits = sorted(hit_times)
    total = len(hits)

    player1, player2 = health.start_percent, health.start_percent
    drain = health.drain_seconds

    for index, hit_t in enumerate(hits, start=1):
        target_p1, target_p2 = _target_after_hit(index, total, health)

        if elapsed_sec < hit_t:
            break

        if drain <= 0:
            player1, player2 = target_p1, target_p2
            continue

        effective_drain = max(drain, 1.0 / fps if fps > 0 else 0.05)
        if elapsed_sec < hit_t + effective_drain:
            u = _ease_out_cubic((elapsed_sec - hit_t) / effective_drain)
            from_p1, from_p2 = player1, player2
            player1 = from_p1 + (target_p1 - from_p1) * u
            player2 = from_p2 + (target_p2 - from_p2) * u
            return HealthSnapshot(
                player1=player1,
                player2=player2,
                flash=_is_flash(elapsed_sec, hits, fps, health),
            )

        player1, player2 = target_p1, target_p2

    return HealthSnapshot(
        player1=player1,
        player2=player2,
        flash=_is_flash(elapsed_sec, hits, fps, health),
    )


def _is_flash(
    elapsed_sec: float,
    hit_times: list[float],
    fps: float,
    health: HealthStyle,
) -> bool:
    if health.flash_frames <= 0 or fps <= 0:
        return False
    window = health.flash_frames / fps
    return any(0.0 <= elapsed_sec - t < window for t in hit_times)
