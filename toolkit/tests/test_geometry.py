from layout.geometry import rect_intersection_area, rect_iou, rects_overlap


def test_rect_intersection_area_disjoint() -> None:
    assert rect_intersection_area(0, 0, 10, 10, 20, 0, 10, 10) == 0.0


def test_rect_intersection_area_overlap() -> None:
    # 5x5 square overlap
    assert rect_intersection_area(0, 0, 10, 10, 5, 5, 10, 10) == 25.0


def test_rect_iou_identical() -> None:
    assert rect_iou(0, 0, 100, 100, 0, 0, 100, 100) == 1.0


def test_rect_iou_disjoint() -> None:
    assert rect_iou(0, 0, 10, 10, 20, 0, 10, 10) == 0.0


def test_rect_iou_half_overlap() -> None:
    """Two equal squares offset horizontally: intersection area 5000, union area 15000."""
    iou = rect_iou(0, 0, 100, 100, 50, 0, 100, 100)
    assert abs(iou - 5000.0 / 15000.0) < 1e-9


def test_rect_iou_zero_union_returns_zero() -> None:
    assert rect_iou(0, 0, 0, 0, 1, 1, 0, 0) == 0.0


def test_rect_iou_matches_overlap_flag() -> None:
    a = (0.0, 0.0, 10.0, 10.0)
    b = (5.0, 5.0, 10.0, 10.0)
    assert rects_overlap(*a, *b)
    assert rect_intersection_area(*a, *b) > 0
    assert 0 < rect_iou(*a, *b) < 1
