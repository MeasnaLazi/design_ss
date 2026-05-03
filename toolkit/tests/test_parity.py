"""Golden parity vs web_ui/screenshot-designer-server.ts."""

import pytest

from core.constants import DESIGN_GRID
from image.color import contrast_ratio, is_hex_color, relative_luminance
from layout.geometry import align_layer, panel_rect, rects_overlap
from layout.grid import is_grid_value, snap_to_grid
from layout.presets import resolve_preset, resolve_preset_id
from layout.text_metrics import estimate_text_height, estimate_text_width


def test_estimate_text_width() -> None:
    assert estimate_text_width("", 60) == 60
    assert estimate_text_width("Hello", 60) == max(60, round(5 * 60 * 0.56))
    assert estimate_text_width("A", 100) == 100


def test_estimate_text_height() -> None:
    assert estimate_text_height(60) == 78
    assert estimate_text_height(96) == 125


def test_is_hex_color() -> None:
    assert is_hex_color("#ffffff")
    assert is_hex_color("#FFFFFF")
    assert is_hex_color("#ffffffff")
    assert not is_hex_color("red")


def test_relative_luminance_white_black() -> None:
    assert relative_luminance("#ffffff") == pytest.approx(1.0, rel=1e-5)
    assert relative_luminance("#000000") == pytest.approx(0.0, abs=1e-5)


def test_contrast_ratio_known() -> None:
    # black vs white
    assert contrast_ratio("#000000", "#ffffff") == pytest.approx(21.0, rel=1e-5)


def test_snap_to_grid() -> None:
    assert snap_to_grid(0, "nearest") == 0
    assert snap_to_grid(15, "nearest") == 16
    assert snap_to_grid(8, "floor") == 0
    assert snap_to_grid(1, "ceil") == 16


def test_is_grid_value() -> None:
    assert is_grid_value(64)
    assert not is_grid_value(65)


def test_rects_overlap() -> None:
    assert rects_overlap(0, 0, 10, 10, 5, 5, 10, 10)
    assert not rects_overlap(0, 0, 10, 10, 10, 0, 10, 10)


def test_panel_rect_matches_strip_formula() -> None:
    gap, w, h = 40, 1290, 2796
    assert panel_rect(0, gap, w, h) == (0.0, 0.0, float(w), float(h))
    assert panel_rect(1, gap, w, h) == (w + gap, 0.0, float(w), float(h))
    assert panel_rect(2, gap, w, h) == (2 * (w + gap), 0.0, float(w), float(h))


def test_align_center_x_canvas() -> None:
    cw, ch = 1290, 2796
    lw, lh = 200, 80
    x, y = align_layer(0, 100, lw, lh, "center_x", 0, 0, cw, ch)
    expected = round((cw / 2 - lw / 2) / DESIGN_GRID) * DESIGN_GRID
    assert x == expected
    assert y == 100


def test_resolve_preset_iphone() -> None:
    p = resolve_preset("iphone", None)
    assert p.preset_id == "appstore_iphone_portrait"
    assert p.width == 1290 and p.height == 2796


def test_resolve_preset_id_unknown_canvas() -> None:
    assert resolve_preset_id("unknown", None) == "appstore_iphone_portrait"


def test_resolve_preset_id_legacy_preset_ids() -> None:
    assert resolve_preset_id(None, "appstore_iphone_67") == "appstore_iphone_portrait"
    assert resolve_preset_id(None, "appstore_ipad_129") == "appstore_ipad_portrait"


def test_play_tablet_landscape_dimensions() -> None:
    p = resolve_preset(None, "play_tablet_landscape")
    assert p.width == 2560 and p.height == 1600
