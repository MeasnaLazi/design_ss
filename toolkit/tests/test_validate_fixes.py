"""Tests for validate_fixes suggested_fix builders."""

from __future__ import annotations

from designer.validate_fixes import fix_margin_violation, fix_move_layer, fix_text_set_font_size


def test_fix_move_layer_includes_panel_index() -> None:
    fix = fix_move_layer("t1", dx=10, dy=-5, panel_index=0)
    assert fix["operation"] == "move_layer"
    assert fix["args"]["layer_id"] == "t1"
    assert fix["args"]["dx"] == 10
    assert fix["args"]["panel_index"] == 0


def test_fix_margin_violation_bottom() -> None:
    fix = fix_margin_violation(
        {"layer_id": "t1", "bottom_past_by_px": 8.0},
        panel_index=1,
    )
    assert fix is not None
    assert fix["args"]["dy"] < 0


def test_fix_text_set_font_size() -> None:
    fix = fix_text_set_font_size("hero", 48.0)
    assert fix["args"]["size"] == 48.0
