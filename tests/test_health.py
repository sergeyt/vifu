import pytest

from vifu.health import health_at_time
from vifu.styles import HealthStyle


@pytest.fixture
def health() -> HealthStyle:
    return HealthStyle(
        start_percent=100.0,
        winner_end_percent=28.0,
        loser_end_percent=0.0,
        drain_seconds=0.0,
        flash_frames=0,
    )


@pytest.fixture
def smooth_health() -> HealthStyle:
    return HealthStyle(
        start_percent=100.0,
        winner_end_percent=28.0,
        loser_end_percent=0.0,
        drain_seconds=0.4,
        flash_frames=0,
    )


def test_full_health_before_first_hit(health: HealthStyle) -> None:
    snap = health_at_time(0.0, [1.0, 2.0, 3.0], health=health, fps=30.0)
    assert snap.player1 == 100.0
    assert snap.player2 == 100.0


def test_player2_zero_on_final_hit(health: HealthStyle) -> None:
    hits = [1.0, 2.0, 3.0]
    snap = health_at_time(3.0, hits, health=health, fps=30.0)
    assert snap.player2 == 0.0
    assert snap.player1 == pytest.approx(28.0)


def test_player1_winner_higher_mid_rally(health: HealthStyle) -> None:
    hits = [1.0, 2.0, 3.0, 4.0]
    snap = health_at_time(2.5, hits, health=health, fps=30.0)
    assert snap.player1 > snap.player2


def test_no_hits_stays_full(health: HealthStyle) -> None:
    snap = health_at_time(5.0, [], health=health, fps=30.0)
    assert snap.player1 == 100.0
    assert snap.player2 == 100.0


def test_partial_damage_between_hits(health: HealthStyle) -> None:
    hits = [2.0, 4.0]
    after_one = health_at_time(2.0, hits, health=health, fps=30.0)
    assert after_one.player2 == 50.0
    assert after_one.player1 == 64.0


def test_smooth_drain_mid_animation(smooth_health: HealthStyle) -> None:
    hits = [2.0, 4.0]
    at_hit = health_at_time(2.0, hits, health=smooth_health, fps=30.0)
    assert at_hit.player2 == 100.0

    mid = health_at_time(2.2, hits, health=smooth_health, fps=30.0)
    assert 100.0 > mid.player2 > 50.0

    settled = health_at_time(2.45, hits, health=smooth_health, fps=30.0)
    assert settled.player2 == pytest.approx(50.0, abs=0.5)
    assert settled.player1 == pytest.approx(64.0, abs=0.5)


def test_smooth_final_hit_reaches_zero(smooth_health: HealthStyle) -> None:
    hits = [1.0, 2.0, 3.0]
    snap = health_at_time(3.5, hits, health=smooth_health, fps=30.0)
    assert snap.player2 == pytest.approx(0.0, abs=0.5)
    assert snap.player1 == pytest.approx(28.0, abs=0.5)
