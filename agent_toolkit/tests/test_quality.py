from agent_toolkit.models import BackgroundModel, DeviceLayerModel, SessionCheckInput, TextLayerModel
from agent_toolkit.quality import explain_failure, predict_checks, preview_budget


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
