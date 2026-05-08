"""Golden parity vs web_ui/screenshot-designer-server.ts."""

import pytest

from image.color import contrast_ratio, is_hex_color, relative_luminance
from layout.presets import resolve_preset, resolve_preset_id


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
