from vifu.layout import PlayerLayout


def test_layout_sort_key() -> None:
    assert PlayerLayout.LEFT_RIGHT.track_sort_key(100.0, 200.0) == 100.0
    assert PlayerLayout.TOP_BOTTOM.track_sort_key(100.0, 200.0) == 200.0
