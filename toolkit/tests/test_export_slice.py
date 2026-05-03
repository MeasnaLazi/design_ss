from __future__ import annotations

import pytest

from designer.export_slice import (
    dedupe_preserve_order,
    parse_panel_indexes_arg,
    slice_agent_layout_summary_v1,
    sorted_contiguous_panel_indexes,
)


def test_parse_panel_indexes_arg() -> None:
    assert parse_panel_indexes_arg("0, 2") == [0, 2]
    assert parse_panel_indexes_arg("1") == [1]


def test_parse_panel_indexes_arg_rejects_empty() -> None:
    with pytest.raises(ValueError):
        parse_panel_indexes_arg("")
    with pytest.raises(ValueError):
        parse_panel_indexes_arg("1,,2")


def test_dedupe_preserve_order() -> None:
    assert dedupe_preserve_order([0, 2, 0, 1]) == [0, 2, 1]


def test_sorted_contiguous_ok() -> None:
    assert sorted_contiguous_panel_indexes([2, 4, 3]) == [2, 3, 4]
    assert sorted_contiguous_panel_indexes([1, 0]) == [0, 1]


def test_sorted_contiguous_rejects_gap() -> None:
    with pytest.raises(ValueError, match="adjacent"):
        sorted_contiguous_panel_indexes([0, 2])


def test_slice_shifts_layers_per_panel() -> None:
    """Two panels 100px wide, 10px gap -> strip 210px; layer at (105,0) only in panel 1."""
    full = {
        "layoutSummaryVersion": 1,
        "savedAt": "2026-01-01T00:00:00.000Z",
        "canvas": {"width": 210, "height": 200},
        "layout": {"artboardPresetId": "appstore_iphone_portrait", "screens": 2, "gap": 10},
        "background": {"type": "solid", "color": "#000000"},
        "layers": [
            {
                "kind": "text",
                "layer_id": "a",
                "layer_name": "L0",
                "zIndex": 0,
                "left": 10,
                "top": 20,
                "width": 30,
                "height": 40,
                "angle": 0,
                "scaleX": 1,
                "scaleY": 1,
                "text": "hi",
                "fontSize": 12,
                "fill": "#fff",
                "fontFamily": "sans",
                "fontWeight": "400",
                "fontStyle": "normal",
                "textAlign": "left",
            },
            {
                "kind": "text",
                "layer_id": "b",
                "layer_name": "L1",
                "zIndex": 1,
                "left": 120,
                "top": 5,
                "width": 20,
                "height": 20,
                "angle": 0,
                "scaleX": 1,
                "scaleY": 1,
                "text": "p2",
                "fontSize": 12,
                "fill": "#fff",
                "fontFamily": "sans",
                "fontWeight": "400",
                "fontStyle": "normal",
                "textAlign": "left",
            },
        ],
    }
    out = slice_agent_layout_summary_v1(full, [0, 1])
    assert out["slicedExportVersion"] == 1
    assert out["requestedPanelIndexes"] == [0, 1]
    panels = out["panels"]
    assert len(panels) == 2
    assert panels[0]["panelIndex"] == 0
    assert panels[0]["panelLocalRect"] == {"left": 0, "top": 0, "width": 100, "height": 200}
    assert panels[0]["stripRect"] == {"left": 0, "top": 0, "width": 100, "height": 200}
    assert panels[1]["panelLocalRect"] == {"left": 0, "top": 0, "width": 100, "height": 200}
    assert panels[1]["stripRect"] == {"left": 110, "top": 0, "width": 100, "height": 200}
    s0 = panels[0]["summary"]
    assert s0["canvas"] == {"width": 100, "height": 200}
    assert s0["layout"] == {"artboardPresetId": "appstore_iphone_portrait", "screens": 1, "gap": 0}
    assert len(s0["layers"]) == 1
    assert s0["layers"][0]["layer_id"] == "a"
    assert s0["layers"][0]["left"] == 10
    assert s0["layers"][0]["top"] == 20

    s1 = panels[1]["summary"]
    assert len(s1["layers"]) == 1
    assert s1["layers"][0]["layer_id"] == "b"
    # panel 1 origin x = 100 + 10 = 110
    assert s1["layers"][0]["left"] == 10.0
    assert s1["layers"][0]["top"] == 5


def test_slice_rejects_non_contiguous_indexes() -> None:
    full = {
        "layoutSummaryVersion": 1,
        "savedAt": "x",
        "canvas": {"width": 300, "height": 200},
        "layout": {"artboardPresetId": "p", "screens": 3, "gap": 0},
        "background": {"type": "solid", "color": "#000"},
        "layers": [],
    }
    with pytest.raises(ValueError, match="adjacent"):
        slice_agent_layout_summary_v1(full, [0, 2])


def test_slice_out_of_range() -> None:
    full = {
        "layoutSummaryVersion": 1,
        "savedAt": "x",
        "canvas": {"width": 100, "height": 200},
        "layout": {"artboardPresetId": "p", "screens": 1, "gap": 0},
        "background": {"type": "solid", "color": "#000"},
        "layers": [],
    }
    with pytest.raises(ValueError, match="out of range"):
        slice_agent_layout_summary_v1(full, [1])


def test_slice_passes_through_error_dict() -> None:
    err = {"error": "no_export_yet"}
    assert slice_agent_layout_summary_v1(err, [0]) == err
