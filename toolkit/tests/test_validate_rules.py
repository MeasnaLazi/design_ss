"""Tests for designer validate-rules (non-vision panel validation)."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from designer.validate_profiles import get_profile
from designer.validate_rules import run_validate_rules


def _write_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj), encoding="utf-8")


def _black_png(path: Path, w: int, h: int) -> None:
    Image.new("RGB", (w, h), (0, 0, 0)).save(path, format="PNG")


def test_png_only_mismatch(tmp_path: Path) -> None:
    png = tmp_path / "p.png"
    _black_png(png, 10, 10)
    out = run_validate_rules(png, None, None, "phone", None)
    assert out["ok"] is False
    ids = [c["id"] for c in out["checks"]]
    assert ids == ["png_preset_match", "panel_data_required"]
    assert out["checks"][0]["ok"] is False
    assert out["checks"][1]["ok"] is False


def test_text_device_vertical_gap_excessive_fails(tmp_path: Path) -> None:
    pw, ph = 1290, 2796
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "title",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 52,
                        "x": 80,
                        "y": 120,
                        "width": 900,
                        "height": 70,
                    },
                    {
                        "layer_id": "sub",
                        "kind": "text",
                        "color": "#cccccc",
                        "size": 28,
                        "x": 80,
                        "y": 210,
                        "width": 800,
                        "height": 40,
                    },
                    {
                        "layer_id": "phone",
                        "kind": "device",
                        "x": 645,
                        "y": 2100,
                        "width": 700,
                        "height": int(0.75 * ph),
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(
        png,
        jpath,
        0,
        None,
        "appstore_iphone_portrait",
        opt=get_profile("appstore_hero").panel,
    )
    gap = next(c for c in out["checks"] if c["id"] == "text_device_vertical_gap")
    assert gap["ok"] is False, gap
    assert out["ok"] is False


def test_text_overlap_fails(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "a",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": 50,
                        "y": 50,
                        "width": 200,
                        "height": 80,
                    },
                    {
                        "layer_id": "b",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": 80,
                        "y": 70,
                        "width": 200,
                        "height": 80,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    assert out["checks"][1]["id"] == "text_no_overlap"
    assert out["checks"][1]["ok"] is False
    assert out["ok"] is False


def test_full_pass_phone_preset(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    # margin ~ max(8, 0.04*1080)=43.2 — place text inside
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "t1",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 52,
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 60,
                    },
                    {
                        "layer_id": "d1",
                        "kind": "device",
                        "x": 540,
                        "y": 900,
                        "width": 700,
                        "height": int(0.75 * ph),
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    assert out["ok"] is True
    by_id = {c["id"]: c for c in out["checks"]}
    assert by_id["png_preset_match"]["ok"] is True
    assert by_id["text_no_overlap"]["ok"] is True
    assert by_id["text_safe_margins"]["ok"] is True
    assert by_id["text_contrast_background"]["ok"] is True
    assert by_id["text_device_no_overlap"]["ok"] is True
    assert by_id["device_height_band"]["ok"] is True


def test_text_span_fail(tmp_path: Path) -> None:
    pw, ph = 1290, 2796
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "t1",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": 60,
                        "y": 60,
                        "width": 1250,
                        "height": 40,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait")
    span = next(c for c in out["checks"] if c["id"] == "text_span_sensible")
    assert span["ok"] is False
    assert out["ok"] is False


def test_multi_panel_requires_index(tmp_path: Path) -> None:
    pw, ph = 1290, 2796
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {"panel_index": 0, "panel_width": pw, "panel_height": ph, "layers": []},
            {"panel_index": 1, "panel_width": pw, "panel_height": ph, "layers": []},
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait")
    assert out["ok"] is False
    assert any(c["id"] == "panel_resolve" and c["ok"] is False for c in out["checks"])


def test_contrast_prefers_local_halo_over_bright_panel_edge(tmp_path: Path) -> None:
    """Light bar at top of PNG must not fail centered white-on-black text (edge-only false positive)."""
    pw, ph = 200, 200
    png = tmp_path / "p.png"
    img = Image.new("RGB", (pw, ph), (0, 0, 0))
    for y in range(0, 40):
        for x in range(pw):
            img.putpixel((x, y), (255, 255, 255))
    img.save(png, format="PNG")
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "hero",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": 80,
                        "y": 80,
                        "width": 40,
                        "height": 40,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, None)
    contrast = next(c for c in out["checks"] if c["id"] == "text_contrast_background")
    assert contrast["ok"] is True, contrast["detail"]


def test_text_safe_margins_shrink_helps_bottom_inset(tmp_path: Path) -> None:
    """Symmetric bbox shrink trims Fabric padding so margin rule matches optical layout."""
    from dataclasses import replace

    from designer.validate_options import ValidateRulesOptions

    pw, ph = 1290, 2796
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    h = 40
    m_inset = 32.0  # default: cap 48 - tolerance 16
    bottom_raw = float(ph) - m_inset + 3.0
    y = bottom_raw - float(h)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "t_margin",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": 50.0,
                        "y": float(y),
                        "width": 400.0,
                        "height": float(h),
                    },
                ],
            },
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    tight = replace(
        ValidateRulesOptions(),
        margin_text_bbox_shrink_px=0.0,
        margin_text_horizontal_extra_px=0.0,
    )
    out_tight = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait", opt=tight)
    margins_tight = next(c for c in out_tight["checks"] if c["id"] == "text_safe_margins")
    assert margins_tight["ok"] is False, margins_tight["detail"]

    out_default = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait")
    margins_def = next(c for c in out_default["checks"] if c["id"] == "text_safe_margins")
    assert margins_def["ok"] is True, margins_def["detail"]


def test_wide_shallow_text_horizontal_extra_fixes_right_margin(tmp_path: Path) -> None:
    """Wide shallow Textbox: base shrink is height-capped; horizontal extra pulls right edge in."""
    from dataclasses import replace

    from designer.validate_options import ValidateRulesOptions

    pw, ph = 1290, 2796
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    w, h = 1000.0, 40.0
    left = float(pw) - w
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "wide",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 32,
                        "x": left,
                        "y": 400.0,
                        "width": w,
                        "height": h,
                    },
                ],
            },
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    no_hx = replace(ValidateRulesOptions(), margin_text_horizontal_extra_px=0.0)
    out_tight = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait", opt=no_hx)
    margins_tight = next(c for c in out_tight["checks"] if c["id"] == "text_safe_margins")
    assert margins_tight["ok"] is False, margins_tight["detail"]

    out_default = run_validate_rules(png, jpath, None, None, "appstore_iphone_portrait")
    margins_def = next(c for c in out_default["checks"] if c["id"] == "text_safe_margins")
    assert margins_def["ok"] is True, margins_def["detail"]


def test_wrong_version(tmp_path: Path) -> None:
    png = tmp_path / "p.png"
    _black_png(png, 10, 10)
    jpath = tmp_path / "d.json"
    _write_json(jpath, {"version": 2, "panels": []})
    out = run_validate_rules(png, jpath, None, None, None)
    assert out["ok"] is False
    assert any(c["id"] == "panel_data_version" for c in out["checks"])


def test_text_font_min_size_fails(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "small",
                        "kind": "text",
                        "content": "Small",
                        "color": "#ffffff",
                        "size": 36,
                        "font": "body",
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 24,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    chk = next(c for c in out["checks"] if c["id"] == "text_font_min_size")
    assert chk["ok"] is False
    assert out["ok"] is False


def test_text_single_line_bbox_flags_tall_single_line_without_newline(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "wrapped",
                        "kind": "text",
                        "content": "Probably wrapping",
                        "color": "#ffffff",
                        "size": 28,
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 60,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    chk = next(c for c in out["checks"] if c["id"] == "text_single_line_bbox")
    assert chk["ok"] is False
    assert out["ok"] is False


def test_text_vertical_rhythm_fails(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "a",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 52,
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 60,
                    },
                    {
                        "layer_id": "b",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 48,
                        "x": 60,
                        "y": 100,
                        "width": 400,
                        "height": 60,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    chk = next(c for c in out["checks"] if c["id"] == "text_vertical_rhythm")
    assert chk["ok"] is False
    assert chk["detail"]["violations"][0].get("suggested_fix")


def test_emit_fixes_only_output(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "small",
                        "kind": "text",
                        "color": "#ffffff",
                        "size": 36,
                        "font": "body",
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 24,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait", emit_fixes_only=True)
    assert "fixes" in out
    assert len(out["fixes"]) >= 1
    assert out["fixes"][0]["operation"] == "text_set_font_size"


def test_text_single_line_bbox_skips_explicit_newlines(tmp_path: Path) -> None:
    pw, ph = 1080, 1920
    png = tmp_path / "p.png"
    _black_png(png, pw, ph)
    data = {
        "version": 1,
        "panels": [
            {
                "panel_index": 0,
                "panel_width": pw,
                "panel_height": ph,
                "layers": [
                    {
                        "layer_id": "two_lines_ok",
                        "kind": "text",
                        "content": "Line one\nLine two",
                        "color": "#ffffff",
                        "size": 28,
                        "x": 60,
                        "y": 60,
                        "width": 400,
                        "height": 80,
                    },
                ],
            }
        ],
    }
    jpath = tmp_path / "d.json"
    _write_json(jpath, data)
    out = run_validate_rules(png, jpath, None, None, "play_phone_portrait")
    chk = next(c for c in out["checks"] if c["id"] == "text_single_line_bbox")
    assert chk["ok"] is True
