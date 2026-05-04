from __future__ import annotations

import pytest

from core.models import SessionCheckInput
from layout.quality import predict_checks
from layout.session_from_agent_export import export_summary_to_session_check


def _minimal_export_v1() -> dict:
    return {
        "layoutSummaryVersion": 1,
        "savedAt": "2026-01-01T00:00:00.000Z",
        "canvas": {"width": 1290, "height": 2796},
        "layout": {"artboardPresetId": "appstore_iphone_portrait", "screens": 1, "gap": 0},
        "background": {"type": "solid", "color": "#101827"},
        "layers": [
            {
                "kind": "text",
                "layer_id": "t1",
                "layer_name": "Title",
                "zIndex": 1,
                "left": 64.0,
                "top": 128.0,
                "width": 400.0,
                "height": 80.0,
                "angle": 0,
                "scaleX": 1,
                "scaleY": 1,
                "text": "Hello world",
                "fontSize": 72.0,
                "fill": "#ffffff",
                "fontFamily": "Inter",
                "fontWeight": "700",
                "fontStyle": "normal",
                "textAlign": "left",
            },
            {
                "kind": "device",
                "layer_id": "d1",
                "layer_name": "Phone",
                "zIndex": 0,
                "left": 395.0,
                "top": 400.0,
                "width": 500.0,
                "height": 1600.0,
                "angle": 0,
                "scaleX": 1,
                "scaleY": 1,
                "device_frame_style_id": "x",
                "device_frame_pack_id": "y",
            },
        ],
    }


def test_export_summary_to_session_check_maps_layers() -> None:
    raw = _minimal_export_v1()
    s = export_summary_to_session_check(raw)
    assert isinstance(s, SessionCheckInput)
    assert s.width == 1290
    assert s.height == 2796
    assert s.screens == 1
    assert s.gap == 0
    assert s.background.type == "color"
    assert s.background.value == "#101827"
    assert len(s.layers) == 2
    assert s.layers[0].kind == "text"
    assert s.layers[0].id == "t1"
    assert s.layers[0].x == 64.0
    assert s.layers[0].content == "Hello world"
    assert s.layers[0].size == 72.0
    assert s.layers[1].kind == "device_frame"
    assert s.layers[1].id == "d1"
    assert s.layers[1].height == 1600.0


def test_export_summary_predict_checks_ok() -> None:
    s = export_summary_to_session_check(_minimal_export_v1())
    r = predict_checks(s)
    assert r.ok is True


def test_export_summary_rejects_bad_version() -> None:
    raw = _minimal_export_v1()
    raw["layoutSummaryVersion"] = 2
    with pytest.raises(ValueError, match="layoutSummaryVersion"):
        export_summary_to_session_check(raw)


def test_export_summary_rejects_error_dict() -> None:
    with pytest.raises(ValueError, match="error"):
        export_summary_to_session_check({"error": "no_export_yet"})


def test_export_multi_panel_strip_screens_gap() -> None:
    raw = _minimal_export_v1()
    raw["canvas"] = {"width": 2620, "height": 2796}
    raw["layout"] = {"artboardPresetId": "p", "screens": 2, "gap": 40}
    s = export_summary_to_session_check(raw)
    assert s.screens == 2
    assert s.gap == 40
    assert s.width == 2620
