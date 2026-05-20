"""Strip-level validation across multiple panels in one agent panel snapshot."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from designer.validate_fixes import attach_fix, fix_set_equal_spacing
from designer.validate_options import StripValidateOptions
from designer.validate_fixes import is_caption_text
from designer.validate_rules import DeviceLayer, TextLayer, load_panel_preview


def _primary_texts(texts: list[TextLayer]) -> list[TextLayer]:
    return [t for t in texts if not is_caption_text(t.font, t.size)]
from image import image_io


def _title_sizes(panel_layers: list) -> list[float]:
    sizes: list[float] = []
    for ly in panel_layers:
        if isinstance(ly, TextLayer) and not ly.font:
            if ly.size >= 40:
                sizes.append(ly.size)
        elif isinstance(ly, TextLayer) and ly.font:
            f = ly.font.strip().lower()
            if f in ("largetitle", "title1", "title2", "title3") and ly.size >= 28:
                sizes.append(ly.size)
        elif isinstance(ly, TextLayer) and ly.size >= 40:
            sizes.append(ly.size)
    return sizes


def _top_text_y(layers: list) -> float | None:
    primary = _primary_texts([ly for ly in layers if isinstance(ly, TextLayer)])
    if not primary:
        return None
    return min(t.y for t in primary)


def _device_height_ratios(layers: list, ph: float) -> list[float]:
    if ph <= 0:
        return []
    return [d.height / ph for d in layers if isinstance(d, DeviceLayer)]


def run_validate_strip_rules(
    panel_data_path: Path,
    opt: StripValidateOptions | None = None,
    *,
    png_dir: Path | None = None,
    emit_fixes_only: bool = False,
) -> dict[str, Any]:
    opt = opt or StripValidateOptions()
    data = load_panel_preview(panel_data_path)
    checks: list[dict[str, Any]] = []

    if data.version != 1:
        return {
            "ok": False,
            "phase": "strip",
            "checks": [{"id": "panel_data_version", "ok": False, "detail": f"expected version 1, got {data.version}"}],
        }

    if len(data.panels) < 2:
        checks.append(
            {
                "id": "strip_multi_panel",
                "ok": False,
                "detail": "need at least 2 panels in snapshot for strip validation",
            }
        )
        return {"ok": False, "phase": "strip", "checks": checks}

    # strip_gap_consistent
    gap_bad: list[dict[str, Any]] = []
    if opt.expected_gap is not None and data.gap is not None:
        if abs(float(data.gap) - float(opt.expected_gap)) > opt.gap_tolerance_px + 1e-6:
            gap_bad.append(
                {
                    "gap": data.gap,
                    "expected": opt.expected_gap,
                    "tolerance_px": opt.gap_tolerance_px,
                }
            )
    checks.append(
        {
            "id": "strip_gap_consistent",
            "ok": not gap_bad,
            "detail": {"expected_gap": opt.expected_gap, "violations": gap_bad},
        }
    )

    # cross_panel_device_scale
    scale_bad: list[dict[str, Any]] = []
    ratios_by_panel: list[tuple[int, float]] = []
    for p in data.panels:
        rs = _device_height_ratios(p.layers, float(p.panel_height))
        if rs:
            ratios_by_panel.append((p.panel_index, sum(rs) / len(rs)))
    if len(ratios_by_panel) >= 2:
        vals = [r for _, r in ratios_by_panel]
        spread = max(vals) - min(vals)
        if spread > opt.cross_panel_device_scale_delta + 1e-9:
            scale_bad.append(
                {
                    "ratios_by_panel": {str(i): round(r, 4) for i, r in ratios_by_panel},
                    "spread": round(spread, 4),
                    "max_delta": opt.cross_panel_device_scale_delta,
                }
            )
    checks.append(
        {
            "id": "cross_panel_device_scale",
            "ok": not scale_bad,
            "detail": {"violations": scale_bad},
        }
    )

    # cross_panel_text_scale
    text_scale_bad: list[dict[str, Any]] = []
    sizes_by_panel: list[tuple[int, float]] = []
    for p in data.panels:
        ts = _title_sizes(p.layers)
        if ts:
            sizes_by_panel.append((p.panel_index, max(ts)))
    if len(sizes_by_panel) >= 2:
        vals = [s for _, s in sizes_by_panel]
        spread = max(vals) - min(vals)
        if spread > opt.cross_panel_text_size_delta_px + 1e-9:
            text_scale_bad.append(
                {
                    "sizes_by_panel": {str(i): round(s, 2) for i, s in sizes_by_panel},
                    "spread_px": round(spread, 2),
                    "max_delta_px": opt.cross_panel_text_size_delta_px,
                }
            )
    checks.append(
        {
            "id": "cross_panel_text_scale",
            "ok": not text_scale_bad,
            "detail": {"violations": text_scale_bad},
        }
    )

    # cross_panel_margin_rhythm
    margin_bad: list[dict[str, Any]] = []
    tops: list[tuple[int, float]] = []
    for p in data.panels:
        ty = _top_text_y(p.layers)
        if ty is not None:
            tops.append((p.panel_index, ty))
    if len(tops) >= 2:
        vals = [t for _, t in tops]
        spread = max(vals) - min(vals)
        if spread > opt.cross_panel_top_margin_delta_px + 1e-9:
            layer_ids = []
            for p in data.panels:
                for ly in p.layers:
                    if isinstance(ly, TextLayer):
                        layer_ids.append(ly.layer_id)
                        break
            fix = (
                attach_fix(
                    {
                        "tops_by_panel": {str(i): round(t, 2) for i, t in tops},
                        "spread_px": round(spread, 2),
                    },
                    fix_set_equal_spacing(layer_ids[: min(3, len(layer_ids))], "y", 16.0)
                    if len(layer_ids) >= 2
                    else None,
                )
                if len(layer_ids) >= 2
                else {"tops_by_panel": {str(i): round(t, 2) for i, t in tops}}
            )
            margin_bad.append(fix)
    checks.append(
        {
            "id": "cross_panel_margin_rhythm",
            "ok": not margin_bad,
            "detail": {"violations": margin_bad},
        }
    )

    # cross_panel_color_harmony
    color_bad: list[dict[str, Any]] = []
    if png_dir is not None and png_dir.is_dir():
        hexes: list[tuple[int, str]] = []
        for p in sorted(data.panels, key=lambda x: x.panel_index):
            png_path = png_dir / f"panel{p.panel_index}.png"
            if not png_path.is_file():
                png_path = png_dir / f"{p.panel_index}.png"
            if not png_path.is_file():
                continue
            img = image_io.load_image(png_path)
            edges = image_io.panel_edge_hexes(img)
            if edges:
                hexes.append((p.panel_index, edges[0]))
        if len(hexes) >= 2:
            ref = hexes[0][1]
            for idx, hx in hexes[1:]:
                dist = image_io.rgb_distance(ref, hx)
                if dist > opt.cross_panel_color_rgb_delta + 1e-6:
                    color_bad.append(
                        {
                            "panel_index": idx,
                            "hex": hx,
                            "reference_panel": hexes[0][0],
                            "reference_hex": ref,
                            "rgb_distance": round(dist, 2),
                        }
                    )
    checks.append(
        {
            "id": "cross_panel_color_harmony",
            "ok": not color_bad,
            "detail": {
                "png_dir": str(png_dir) if png_dir else None,
                "skipped": png_dir is None,
                "violations": color_bad,
            },
        }
    )

    if opt.strict_default_gray_background and png_dir is not None and png_dir.is_dir():
        gray_violations: list[dict[str, Any]] = []
        for p in data.panels:
            for name in (f"panel{p.panel_index}.png", f"{p.panel_index}.png"):
                path = png_dir / name
                if path.is_file():
                    img = image_io.load_image(path)
                    for hx in image_io.panel_edge_hexes(img):
                        if hx.lower() in ("#f5f5f5", "#f0f0f0", "#eeeeee"):
                            gray_violations.append({"panel_index": p.panel_index, "edge_sample": hx})
                    break
        checks.append(
            {
                "id": "strip_background_not_default_gray",
                "ok": not gray_violations,
                "detail": {"violations": gray_violations},
            }
        )

    ok_all = all(c["ok"] for c in checks)
    result: dict[str, Any] = {"ok": ok_all, "phase": "strip", "checks": checks}
    if emit_fixes_only:
        fixes = []
        for chk in checks:
            if chk.get("ok"):
                continue
            for item in (chk.get("detail") or {}).get("violations") or []:
                if isinstance(item, dict) and "suggested_fix" in item:
                    fixes.append({"check_id": chk["id"], **item["suggested_fix"]})
        return {"ok": ok_all, "phase": "strip", "fixes": fixes, "checks": checks}
    return result
