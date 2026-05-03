from core.models import BackgroundModel, DeviceLayerModel, SessionCheckInput, TextLayerModel
from layout.quality import explain_failure, predict_checks, preview_budget


def test_preview_budget() -> None:
    assert preview_budget(0)["remaining"] == 4
    assert preview_budget(4)["would_exceed"] is True
    assert preview_budget(3)["remaining"] == 1


def test_predict_checks_ok_minimal() -> None:
    """Non-overlapping text (top safe) + device sized ~57% canvas height."""
    s = SessionCheckInput(
        width=1290,
        height=2796,
        background=BackgroundModel(type="color", value="#101827"),
        layers=[
            DeviceLayerModel(
                kind="device_frame",
                id="d1",
                x=395,
                y=1196,
                width=500,
                height=1600,
            ),
            TextLayerModel(
                kind="text",
                id="t1",
                x=64,
                y=128,
                width=400,
                height=78,
                content="Short title here",
                size=60,
                color="#ffffff",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is True
    assert r.to_dict()["ok"] is True


def test_predict_checks_contrast_fail() -> None:
    s = SessionCheckInput(
        width=1290,
        height=2796,
        background=BackgroundModel(type="color", value="#ffffff"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t1",
                x=100,
                y=200,
                width=400,
                height=78,
                content="Hi",
                size=60,
                color="#eeeeee",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is False
    assert any("contrast" in e.lower() for e in r.errors)
    assert explain_failure(r) != "ok"


def test_predict_checks_multi_panel_text_in_second_panel_safe() -> None:
    """Strip width 2×1290 + 40 gap; text sits in panel 2 safe rect."""
    s = SessionCheckInput(
        width=2620,
        height=2796,
        screens=2,
        gap=40,
        background=BackgroundModel(type="color", value="#101827"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t1",
                x=1390,
                y=128,
                width=400,
                height=78,
                content="Second panel title",
                size=60,
                color="#ffffff",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is True


def test_predict_checks_multi_panel_text_bleeds_into_gap() -> None:
    """Text bbox in gutter between panels must fail per-panel safe zone."""
    s = SessionCheckInput(
        width=2620,
        height=2796,
        screens=2,
        gap=40,
        background=BackgroundModel(type="color", value="#101827"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t1",
                x=1260,
                y=128,
                width=120,
                height=78,
                content="Straddling gap",
                size=60,
                color="#ffffff",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is False
    assert any("outside safe zones" in e for e in r.errors)


def test_predict_checks_text_text_overlap_same_panel() -> None:
    """Two text boxes in the same column with overlapping bboxes must fail."""
    s = SessionCheckInput(
        width=6610,
        height=2796,
        screens=5,
        gap=40,
        background=BackgroundModel(type="color", value="#101827"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t_title",
                x=100,
                y=128,
                width=800,
                height=120,
                content="Title line",
                size=72,
                color="#ffffff",
            ),
            TextLayerModel(
                kind="text",
                id="t_sub",
                x=100,
                y=180,
                width=800,
                height=100,
                content="one two three four five six seven eight",
                size=36,
                color="#e2e8f0",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is False
    assert any("overlaps text layer" in e and "same strip column" in e for e in r.errors)


def test_predict_checks_text_text_no_overlap_adjacent_panels() -> None:
    """Same vertical band in two different columns must not trip text–text overlap."""
    s = SessionCheckInput(
        width=6610,
        height=2796,
        screens=5,
        gap=40,
        background=BackgroundModel(type="color", value="#101827"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t_a",
                x=100,
                y=128,
                width=800,
                height=80,
                content="Col zero",
                size=72,
                color="#ffffff",
            ),
            TextLayerModel(
                kind="text",
                id="t_b",
                x=1420,
                y=128,
                width=800,
                height=80,
                content="Col one",
                size=72,
                color="#ffffff",
            ),
        ],
    )
    r = predict_checks(s)
    assert r.ok is True


def test_predict_checks_headline_too_small() -> None:
    s = SessionCheckInput(
        width=1290,
        height=2796,
        background=BackgroundModel(type="color", value="#000000"),
        layers=[
            TextLayerModel(
                kind="text",
                id="t1",
                x=100,
                y=200,
                width=400,
                height=40,
                content="One two three four five six",
                size=40,
                color="#ffffff",
            ),
        ],
    )
    r = predict_checks(s)
    assert not r.ok
    assert any("at least 60" in e for e in r.errors)
