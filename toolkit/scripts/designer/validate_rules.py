"""Non-vision panel preview validation (PNG + optional agent panel JSON v1)."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Annotated, Any, Literal

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from designer import validate_fixes as vf
from designer.validate_options import ValidateRulesOptions
from image import color as color_mod
from image import image_io

TEXT_PRESET_SIZE_BANDS: dict[str, tuple[float, float]] = {
    "largetitle": (48, 60),
    "title1": (40, 48),
    "title2": (32, 40),
    "title3": (28, 34),
    "headline": (24, 30),
    "body": (20, 24),
    "callout": (18, 22),
    "subheadline": (16, 20),
}

DEFAULT_GRAY_HEXES = frozenset({"#f5f5f5", "#f0f0f0", "#eeeeee", "#e5e5e5", "#ffffff"})


class BackgroundSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str = "color"
    value: str | dict[str, Any] | None = None


class TextLayer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    layer_id: str
    kind: Literal["text"] = "text"
    z_index: int = 0
    content: str = ""
    size: float = 0
    color: str
    align: str = "left"
    weight: str = "400"
    font: str | None = None
    line_height: float | None = None
    letter_spacing: float | None = None
    x: float
    y: float
    width: float
    height: float


class DeviceLayer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    layer_id: str
    kind: Literal["device"] = "device"
    z_index: int = 0
    x: float
    y: float
    width: float
    height: float
    angle: float = 0
    frame: str = ""
    pack_id: str = ""


LayerUnion = Annotated[TextLayer | DeviceLayer, Field(discriminator="kind")]


class PanelEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    panel_index: int
    panel_width: int
    panel_height: int
    panel_x: int = 0
    panel_y: int = 0
    layers: list[LayerUnion] = Field(default_factory=list)


class AgentPanelPreviewData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: int
    gap: float | None = None
    workspace_width: int | None = None
    workspace_height: int | None = None
    background: BackgroundSnapshot | None = None
    panels: list[PanelEntry]


def _text_bbox(layer: TextLayer) -> tuple[float, float, float, float]:
    return (layer.x, layer.y, layer.x + layer.width, layer.y + layer.height)


def _text_bbox_for_margin(
    layer: TextLayer,
    shrink: float,
    horizontal_extra: float,
) -> tuple[float, float, float, float]:
    left, top, right, bottom = _text_bbox(layer)
    if shrink <= 0 and horizontal_extra <= 0:
        return left, top, right, bottom
    w = right - left
    h = bottom - top
    cap_x = max(0.0, w / 2.0 - 1e-3)
    cap_y = max(0.0, h / 2.0 - 1e-3)
    s_y = min(float(shrink), cap_y) if shrink > 0 else 0.0
    s_x = 0.0
    if shrink > 0 or horizontal_extra > 0:
        s_x = min(float(shrink) + max(0.0, float(horizontal_extra)), cap_x)
    if s_x <= 0 and s_y <= 0:
        return left, top, right, bottom
    return left + s_x, top + s_y, right - s_x, bottom - s_y


def _margin_violation_detail(
    layer_id: str,
    left: float,
    top: float,
    right: float,
    bottom: float,
    pw: float,
    ph: float,
    m: float,
) -> dict[str, Any]:
    edges: list[str] = []
    out: dict[str, Any] = {"layer_id": layer_id, "edges": edges}
    if left < m - 1e-6:
        edges.append("left")
        out["left_short_by_px"] = round(m - left, 2)
    if top < m - 1e-6:
        edges.append("top")
        out["top_short_by_px"] = round(m - top, 2)
    if right > pw - m + 1e-6:
        edges.append("right")
        out["right_past_by_px"] = round(right - (pw - m), 2)
    if bottom > ph - m + 1e-6:
        edges.append("bottom")
        out["bottom_past_by_px"] = round(bottom - (ph - m), 2)
    return out


def _device_bbox(layer: DeviceLayer) -> tuple[float, float, float, float]:
    hw, hh = layer.width / 2.0, layer.height / 2.0
    return (layer.x - hw, layer.y - hh, layer.x + hw, layer.y + hh)


def _text_stack_bbox(texts: list[TextLayer]) -> tuple[float, float, float, float] | None:
    if not texts:
        return None
    left = min(t.x for t in texts)
    top = min(t.y for t in texts)
    right = max(t.x + t.width for t in texts)
    bottom = max(t.y + t.height for t in texts)
    return left, top, right, bottom


def _vertical_gap_separated(
    upper: tuple[float, float, float, float],
    lower: tuple[float, float, float, float],
) -> float | None:
    """Gap in px when ``lower`` is strictly below ``upper`` (no vertical overlap)."""
    if lower[1] >= upper[3] - 1.0:
        return lower[1] - upper[3]
    return None


def _max_text_device_gap_allowed(panel_height: int, opt: ValidateRulesOptions) -> float:
    by_frac = float(opt.max_text_device_gap_frac) * panel_height if opt.max_text_device_gap_frac > 0 else math.inf
    if opt.max_text_device_gap_px > 0:
        return min(by_frac, float(opt.max_text_device_gap_px))
    return by_frac


def _intersection_area(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    dx = min(a[2], b[2]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[1], b[1])
    if dx <= 0 or dy <= 0:
        return 0.0
    return float(dx * dy)


def _touches_only(a: tuple[float, float, float, float], b: tuple[float, float, float, float], eps: float = 1e-3) -> bool:
    return _intersection_area(a, b) > eps


def _margin_inset_for_check(panel_w: int, panel_h: int, opt: ValidateRulesOptions) -> tuple[float, float, float]:
    short = float(min(panel_w, panel_h))
    base = opt.margin_frac * short
    m_nominal = max(float(opt.margin_floor_px), base)
    m_capped = m_nominal
    if opt.margin_max_px > 0:
        m_capped = min(m_capped, float(opt.margin_max_px))
    m_check = max(0.0, m_capped - float(opt.margin_tolerance_px))
    return m_nominal, m_capped, m_check


def _min_contrast_for_text(size: float, opt: ValidateRulesOptions) -> float:
    return opt.min_contrast_large if size >= opt.large_text_size_px else opt.min_contrast_normal


def _text_suspects_unwanted_wrap(layer: TextLayer, opt: ValidateRulesOptions) -> bool:
    if opt.text_unwanted_wrap_height_to_size_ratio <= 0:
        return False
    body = (layer.content or "").replace("\r\n", "\n")
    if "\n" in body:
        return False
    if not body.strip() or layer.size <= 0:
        return False
    return (layer.height / layer.size) >= opt.text_unwanted_wrap_height_to_size_ratio + 1e-9


def _primary_texts(texts: list[TextLayer]) -> list[TextLayer]:
    return [t for t in texts if not vf.is_caption_text(t.font, t.size)]


def _hero_text(texts: list[TextLayer], ph: float) -> TextLayer | None:
    primary = _primary_texts(texts)
    if not primary:
        return None
    top_band = ph * 0.25
    candidates = [t for t in primary if t.y <= top_band]
    pool = candidates if candidates else primary
    return max(pool, key=lambda t: t.size)


def _declared_background_contrast(text_hex: str, bg: BackgroundSnapshot | None) -> tuple[float, bool]:
    if bg is None:
        return math.inf, True
    btype = (bg.type or "color").strip().lower()
    val = bg.value
    if btype in ("color", "solid") and isinstance(val, str):
        ratio = color_mod.text_contrast_vs_background_conservative(text_hex, "color", val)
        return ratio, True
    if btype == "gradient" and isinstance(val, dict):
        stops = val.get("stops") if isinstance(val.get("stops"), list) else []
        ratio = color_mod.min_contrast_across_gradient_stops(text_hex, stops)
        return ratio, True
    ratio = color_mod.text_contrast_vs_background_conservative(text_hex, btype, val)
    return ratio, True


def _resolve_panel(
    data: AgentPanelPreviewData,
    panel_index: int | None,
) -> tuple[PanelEntry | None, str | None]:
    if not data.panels:
        return None, "panel data has empty panels[]"
    if panel_index is not None:
        for p in data.panels:
            if p.panel_index == panel_index:
                return p, None
        return None, f"no panel with panel_index={panel_index}"
    if len(data.panels) == 1:
        return data.panels[0], None
    return None, "multiple panels in JSON; pass --panel-index for geometry/contrast rules"


def load_panel_preview(path: Path) -> AgentPanelPreviewData:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(AgentPanelPreviewData).validate_python(raw)


def _attach_margin_fixes(details: list[dict[str, Any]], panel_index: int) -> list[dict[str, Any]]:
    return [vf.attach_fix(d, vf.fix_margin_violation(d, panel_index=panel_index)) for d in details]


def run_validate_rules(
    png_path: Path,
    panel_data_path: Path | None,
    panel_index: int | None,
    canvas_size: str | None,
    preset_id: str | None,
    opt: ValidateRulesOptions | None = None,
    *,
    theme: dict[str, Any] | None = None,
    emit_fixes_only: bool = False,
) -> dict[str, Any]:
    opt = opt or ValidateRulesOptions()
    checks: list[dict[str, Any]] = []
    pidx = panel_index if panel_index is not None else 0

    img = image_io.load_image(png_path)
    info = image_io.image_info(img)

    dim = image_io.match_preset_dimensions(info.width, info.height, canvas_size, preset_id)
    png_ok = bool(dim["matches"])
    checks.append(
        {
            "id": "png_preset_match",
            "ok": png_ok,
            "detail": dim if not png_ok else {"matches": True, "presetId": dim["expected"]["presetId"]},
        }
    )

    if panel_data_path is None:
        checks.append(
            {
                "id": "panel_data_required",
                "ok": False,
                "detail": "missing --panel-data; geometry/contrast/theme rules not run",
            }
        )
        ok_all = False
        result = {"ok": ok_all, "phase": "rules", "checks": checks}
        return _maybe_emit_fixes_only(result, emit_fixes_only)

    data = load_panel_preview(panel_data_path)
    if data.version != 1:
        checks.append(
            {
                "id": "panel_data_version",
                "ok": False,
                "detail": f"expected version 1, got {data.version}",
            }
        )
        result = {"ok": False, "phase": "rules", "checks": checks}
        return _maybe_emit_fixes_only(result, emit_fixes_only)

    panel, err = _resolve_panel(data, panel_index)
    if err:
        checks.append({"id": "panel_resolve", "ok": False, "detail": err})
        result = {"ok": False, "phase": "rules", "checks": checks}
        return _maybe_emit_fixes_only(result, emit_fixes_only)
    assert panel is not None
    pidx = panel.panel_index

    pw, ph = float(panel.panel_width), float(panel.panel_height)
    m_nominal, m_capped, m = _margin_inset_for_check(panel.panel_width, panel.panel_height, opt)

    texts = [ly for ly in panel.layers if isinstance(ly, TextLayer)]
    devices = [ly for ly in panel.layers if isinstance(ly, DeviceLayer)]
    primary_texts = _primary_texts(texts)

    # text_no_overlap
    overlap_pairs: list[str] = []
    overlap_violations: list[dict[str, Any]] = []
    for i, a in enumerate(texts):
        ba = _text_bbox(a)
        for b in texts[i + 1 :]:
            if _touches_only(ba, _text_bbox(b)):
                overlap_pairs.append(f"{a.layer_id} vs {b.layer_id}")
                overlap_violations.append(
                    vf.attach_fix(
                        {"pair": f"{a.layer_id} vs {b.layer_id}", "layer_id": b.layer_id},
                        vf.fix_text_overlap_pair(a.layer_id, b.layer_id),
                    )
                )
    checks.append(
        {
            "id": "text_no_overlap",
            "ok": not overlap_pairs,
            "detail": {"overlapping_pairs": overlap_pairs, "violations": overlap_violations},
        }
    )

    # text_safe_margins
    margin_violations: list[str] = []
    margin_violation_details: list[dict[str, Any]] = []
    for t in texts:
        left, top, right, bottom = _text_bbox_for_margin(
            t, opt.margin_text_bbox_shrink_px, opt.margin_text_horizontal_extra_px
        )
        if left < m - 1e-6 or top < m - 1e-6 or right > pw - m + 1e-6 or bottom > ph - m + 1e-6:
            margin_violations.append(t.layer_id)
            margin_violation_details.append(
                _margin_violation_detail(t.layer_id, left, top, right, bottom, pw, ph, m)
            )
    margin_violation_details = _attach_margin_fixes(margin_violation_details, pidx)
    checks.append(
        {
            "id": "text_safe_margins",
            "ok": not margin_violations,
            "detail": {
                "margin_px": round(m, 2),
                "margin_nominal_px": round(m_nominal, 2),
                "margin_capped_px": round(m_capped, 2),
                "violations": margin_violations,
                "violations_detail": margin_violation_details,
            },
        }
    )

    # text_span_sensible
    span_bad = []
    for t in texts:
        ratio = (t.width / pw) if pw > 0 else 999.0
        if ratio > opt.max_text_span + 1e-9:
            span_bad.append(
                vf.attach_fix(
                    {"layer_id": t.layer_id, "width_ratio": round(ratio, 4)},
                    vf.fix_layer_patch(t.layer_id, {"width": round(pw * opt.max_text_span * 0.9)}, pidx),
                )
            )
    checks.append(
        {
            "id": "text_span_sensible",
            "ok": not span_bad,
            "detail": {"max_span": opt.max_text_span, "violations": span_bad},
        }
    )

    # text_font_min_size (primary only — captions excluded)
    min_size_bad = []
    if opt.min_text_font_size_px > 0:
        need = opt.min_text_font_size_px
        for t in primary_texts:
            if t.size + 1e-9 < need:
                min_size_bad.append(
                    vf.attach_fix(
                        {
                            "layer_id": t.layer_id,
                            "size": round(t.size, 3),
                            "min_required_px": round(need, 3),
                            "short_by_px": round(max(0.0, need - t.size), 3),
                        },
                        vf.fix_text_set_font_size(t.layer_id, need),
                    )
                )
    checks.append(
        {
            "id": "text_font_min_size",
            "ok": not min_size_bad,
            "detail": {"min_text_font_size_px": opt.min_text_font_size_px, "violations": min_size_bad},
        }
    )

    # text_single_line_bbox
    wrap_bad = []
    if opt.text_unwanted_wrap_height_to_size_ratio > 0:
        thr = opt.text_unwanted_wrap_height_to_size_ratio
        for t in texts:
            if not _text_suspects_unwanted_wrap(t, opt):
                continue
            wrap_bad.append(
                vf.attach_fix(
                    {
                        "layer_id": t.layer_id,
                        "height_to_size": round((t.height / t.size) if t.size > 0 else 0.0, 4),
                        "max_ratio_for_single_line_estimate": thr,
                    },
                    vf.fix_layer_patch(t.layer_id, {"height": round(t.size * 1.2)}, pidx),
                )
            )
    checks.append(
        {
            "id": "text_single_line_bbox",
            "ok": not wrap_bad,
            "detail": {
                "height_to_size_ratio_threshold": opt.text_unwanted_wrap_height_to_size_ratio,
                "violations": wrap_bad,
            },
        }
    )

    # text_device_no_overlap
    td_bad: list[dict[str, Any]] = []
    for t in texts:
        tb = _text_bbox(t)
        for d in devices:
            if _touches_only(tb, _device_bbox(d)):
                td_bad.append(
                    vf.attach_fix(
                        {"pair": f"{t.layer_id} vs {d.layer_id}", "layer_id": t.layer_id},
                        vf.fix_text_device_overlap(t.layer_id),
                    )
                )
    checks.append(
        {"id": "text_device_no_overlap", "ok": not td_bad, "detail": {"violations": td_bad}}
    )

    # text_device_vertical_gap — dead space between copy block and device (common hero mis-layout)
    gap_bad: list[dict[str, Any]] = []
    stack = _text_stack_bbox(texts)
    max_gap = _max_text_device_gap_allowed(ph, opt)
    if stack is not None and devices and max_gap < math.inf:
        for d in devices:
            db = _device_bbox(d)
            gap_px = _vertical_gap_separated(stack, db)
            if gap_px is None:
                gap_px = _vertical_gap_separated(db, stack)
            if gap_px is None or gap_px <= max_gap + 1e-6:
                continue
            excess = gap_px - max_gap
            gap_bad.append(
                vf.attach_fix(
                    {
                        "device_layer_id": d.layer_id,
                        "gap_px": round(gap_px, 2),
                        "max_allowed_px": round(max_gap, 2),
                        "excess_px": round(excess, 2),
                    },
                    vf.fix_device_move_delta(d.layer_id, 0, -round(excess), panel_index=pidx),
                )
            )
    checks.append(
        {
            "id": "text_device_vertical_gap",
            "ok": not gap_bad,
            "detail": {
                "max_allowed_px": round(max_gap, 2) if max_gap < math.inf else None,
                "max_text_device_gap_frac": opt.max_text_device_gap_frac,
                "violations": gap_bad,
                "skipped": stack is None or not devices,
            },
        }
    )

    # device_height_band
    dh_bad = []
    for d in devices:
        r = (d.height / ph) if ph > 0 else 0.0
        if r < opt.min_device_height_ratio - 1e-9 or r > opt.max_device_height_ratio + 1e-9:
            dh_bad.append(
                vf.attach_fix(
                    {
                        "layer_id": d.layer_id,
                        "height_ratio": round(r, 4),
                        "allowed": [opt.min_device_height_ratio, opt.max_device_height_ratio],
                    },
                    vf.fix_device_height_band(
                        d.layer_id, ph, r, opt.min_device_height_ratio, opt.max_device_height_ratio
                    ),
                )
            )
    checks.append(
        {"id": "device_height_band", "ok": not dh_bad, "detail": {"violations": dh_bad}}
    )

    # device_pairs_low_overlap
    pair_bad = []
    if len(devices) >= 2:
        for i, da in enumerate(devices):
            ra = _device_bbox(da)
            area_a = max(0.0, ra[2] - ra[0]) * max(0.0, ra[3] - ra[1])
            for db_ly in devices[i + 1 :]:
                rb = _device_bbox(db_ly)
                area_b = max(0.0, rb[2] - rb[0]) * max(0.0, rb[3] - rb[1])
                inter = _intersection_area(ra, rb)
                denom = min(area_a, area_b) if min(area_a, area_b) > 0 else 1.0
                frac = inter / denom
                if frac > opt.max_device_pair_overlap + 1e-9:
                    pair_bad.append(
                        vf.attach_fix(
                            {
                                "a": da.layer_id,
                                "b": db_ly.layer_id,
                                "overlap_fraction": round(frac, 4),
                            },
                            vf.fix_move_layer(db_ly.layer_id, dx=32, panel_index=pidx),
                        )
                    )
    checks.append(
        {"id": "device_pairs_low_overlap", "ok": not pair_bad, "detail": {"violations": pair_bad}}
    )

    png_matches_panel = info.width == panel.panel_width and info.height == panel.panel_height

    # text_vertical_rhythm
    rhythm_bad = []
    if opt.min_text_gap_px > 0 and len(primary_texts) >= 2:
        sorted_t = sorted(primary_texts, key=lambda t: t.y)
        for upper, lower in zip(sorted_t, sorted_t[1:]):
            gap_px = lower.y - (upper.y + upper.height)
            if gap_px + 1e-6 < opt.min_text_gap_px:
                need_dy = opt.min_text_gap_px - gap_px
                rhythm_bad.append(
                    vf.attach_fix(
                        {
                            "upper": upper.layer_id,
                            "lower": lower.layer_id,
                            "gap_px": round(gap_px, 2),
                            "min_required_px": opt.min_text_gap_px,
                        },
                        vf.fix_move_layer(lower.layer_id, dy=round(need_dy), panel_index=pidx),
                    )
                )
    checks.append(
        {
            "id": "text_vertical_rhythm",
            "ok": not rhythm_bad,
            "detail": {"min_text_gap_px": opt.min_text_gap_px, "violations": rhythm_bad},
        }
    )

    # text_hierarchy_sizes
    hierarchy_bad = []
    if len(primary_texts) >= 2:
        hero = _hero_text(texts, ph)
        if hero:
            max_size = max(t.size for t in primary_texts)
            for t in primary_texts:
                if t.layer_id == hero.layer_id:
                    continue
                if t.size > hero.size + 1e-6 and t.size < max_size - 1e-6:
                    hierarchy_bad.append(
                        vf.attach_fix(
                            {
                                "layer_id": t.layer_id,
                                "size": t.size,
                                "hero_layer_id": hero.layer_id,
                                "hero_size": hero.size,
                            },
                            vf.fix_text_set_font_size(t.layer_id, hero.size * 0.75),
                        )
                    )
                elif t.size >= max_size - 1e-6 and t.layer_id != hero.layer_id:
                    hierarchy_bad.append(
                        vf.attach_fix(
                            {
                                "layer_id": t.layer_id,
                                "reason": "non_hero_has_max_size",
                                "hero_layer_id": hero.layer_id,
                            },
                            vf.fix_text_set_font_size(t.layer_id, hero.size * 0.85),
                        )
                    )
    checks.append(
        {
            "id": "text_hierarchy_sizes",
            "ok": not hierarchy_bad,
            "detail": {"violations": hierarchy_bad},
        }
    )

    # text_align_consistency
    align_bad = []
    if len(primary_texts) >= 2:
        hero = _hero_text(texts, ph)
        aligns = {t.align for t in primary_texts if hero is None or t.layer_id != hero.layer_id}
        if len(aligns) > 1:
            target = hero.align if hero else primary_texts[0].align
            for t in primary_texts:
                if t.align != target and (hero is None or t.layer_id != hero.layer_id):
                    align_bad.append(
                        vf.attach_fix(
                            {"layer_id": t.layer_id, "align": t.align, "expected": target},
                            vf.fix_layer_patch(t.layer_id, {"align": target}, pidx),
                        )
                    )
    checks.append(
        {"id": "text_align_consistency", "ok": not align_bad, "detail": {"violations": align_bad}}
    )

    # device_horizontal_center
    center_bad = []
    if opt.require_device_center_x:
        tol = opt.device_center_tolerance_px
        cx_target = pw / 2.0
        for d in devices:
            if abs(d.x - cx_target) > tol + 1e-6:
                center_bad.append(
                    vf.attach_fix(
                        {
                            "layer_id": d.layer_id,
                            "x": d.x,
                            "panel_center_x": cx_target,
                            "tolerance_px": tol,
                        },
                        vf.fix_device_center_x(d.layer_id, pw, d.x, pidx),
                    )
                )
    checks.append(
        {
            "id": "device_horizontal_center",
            "ok": not center_bad,
            "detail": {"require_device_center_x": opt.require_device_center_x, "violations": center_bad},
        }
    )

    # device_safe_bottom
    bottom_bad = []
    for d in devices:
        _l, _t, _r, bottom = _device_bbox(d)
        if bottom > ph - m + 1e-6:
            bottom_bad.append(
                vf.attach_fix(
                    {
                        "layer_id": d.layer_id,
                        "bottom": round(bottom, 2),
                        "max_bottom": round(ph - m, 2),
                    },
                    vf.fix_device_safe_bottom(
                        d.layer_id,
                        pw,
                        ph,
                        m,
                        {"x": d.x, "y": d.y, "width": d.width, "height": d.height},
                        pidx,
                    ),
                )
            )
    checks.append(
        {"id": "device_safe_bottom", "ok": not bottom_bad, "detail": {"violations": bottom_bad}}
    )

    # layer_z_order_sane
    z_bad = []
    for t in texts:
        tb = _text_bbox(t)
        for d in devices:
            if _touches_only(tb, _device_bbox(d)) and t.z_index <= d.z_index:
                z_bad.append(
                    vf.attach_fix(
                        {
                            "text_layer_id": t.layer_id,
                            "device_layer_id": d.layer_id,
                            "text_z_index": t.z_index,
                            "device_z_index": d.z_index,
                        },
                        vf.fix_set_z_index(t.layer_id, d.z_index + 1),
                    )
                )
    checks.append(
        {"id": "layer_z_order_sane", "ok": not z_bad, "detail": {"violations": z_bad}}
    )

    # text_preset_size_band
    preset_bad = []
    if opt.enable_text_preset_size_band:
        for t in texts:
            if not t.font:
                continue
            band = TEXT_PRESET_SIZE_BANDS.get(t.font.strip().lower())
            if not band:
                continue
            lo, hi = band
            if t.size + 1e-9 < lo or t.size > hi + 1e-9:
                target = (lo + hi) / 2.0
                preset_bad.append(
                    vf.attach_fix(
                        {
                            "layer_id": t.layer_id,
                            "font": t.font,
                            "size": t.size,
                            "expected_band": [lo, hi],
                        },
                        vf.fix_text_set_font_size(t.layer_id, target),
                    )
                )
    checks.append(
        {
            "id": "text_preset_size_band",
            "ok": not preset_bad,
            "detail": {"enabled": opt.enable_text_preset_size_band, "violations": preset_bad},
        }
    )

    # Theme + declared background contrast
    theme_bad = []
    if theme:
        theme_obj = theme.get("theme") if isinstance(theme.get("theme"), dict) else theme
        if isinstance(theme_obj, dict):
            for key in ("primary_color", "secondary_color"):
                hex_c = theme_obj.get(key)
                if not isinstance(hex_c, str) or not color_mod.is_hex_color(hex_c):
                    continue
                for t in primary_texts:
                    if not color_mod.is_hex_color(t.color.strip()):
                        continue
                    ratio = color_mod.contrast_ratio(t.color.strip(), hex_c.strip())
                    if ratio < opt.min_theme_contrast:
                        alt = "#ffffff" if color_mod.contrast_ratio("#ffffff", hex_c) >= opt.min_theme_contrast else "#111111"
                        theme_bad.append(
                            vf.attach_fix(
                                {
                                    "layer_id": t.layer_id,
                                    "theme_key": key,
                                    "min_ratio": round(ratio, 3),
                                    "required": opt.min_theme_contrast,
                                },
                                vf.fix_contrast_text(t.layer_id, alt),
                            )
                        )
    checks.append(
        {"id": "text_color_on_theme", "ok": not theme_bad, "detail": {"violations": theme_bad}}
    )

    declared_bad = []
    if data.background is not None:
        for t in texts:
            if not color_mod.is_hex_color(t.color.strip()):
                continue
            ratio, _ = _declared_background_contrast(t.color.strip(), data.background)
            need = _min_contrast_for_text(t.size, opt)
            if ratio < need:
                declared_bad.append(
                    vf.attach_fix(
                        {
                            "layer_id": t.layer_id,
                            "min_ratio": round(ratio, 3),
                            "required": need,
                            "source": "declared_background",
                        },
                        vf.fix_contrast_text(t.layer_id),
                    )
                )
    checks.append(
        {
            "id": "text_contrast_declared_background",
            "ok": not declared_bad,
            "detail": {"violations": declared_bad},
        }
    )

    # text_contrast_background (PNG) — fail only if BOTH declared (when present) and sampled fail
    contrast_ok = True
    contrast_detail: dict[str, Any] = {}
    if png_matches_panel:
        edge_hexes = image_io.panel_edge_hexes(img)
        contrast_detail["edge_background_samples"] = edge_hexes
        halo_pad = max(8, min(48, int(min(pw, ph) * 0.02)))
        text_fails: list[dict[str, Any]] = []
        for t in texts:
            if not color_mod.is_hex_color(t.color.strip()):
                text_fails.append({"layer_id": t.layer_id, "reason": "invalid_text_color", "color": t.color})
                continue
            left, top, right, bottom = _text_bbox(t)
            local_hexes = image_io.bbox_halo_hexes(img, left, top, right, bottom, halo_pad)
            bg_hexes = local_hexes if local_hexes else edge_hexes
            sample_source = "local_bbox_halo" if local_hexes else "panel_edges_fallback"
            min_ratio = math.inf
            worst_bg = ""
            for bg in bg_hexes:
                if not color_mod.is_hex_color(bg):
                    continue
                r = color_mod.contrast_ratio(t.color.strip(), bg)
                if r < min_ratio:
                    min_ratio = r
                    worst_bg = bg
            need = _min_contrast_for_text(t.size, opt)
            declared_ratio, _ = _declared_background_contrast(t.color.strip(), data.background)
            declared_ok = declared_ratio >= need
            sampled_ok = min_ratio >= need
            if not sampled_ok and not declared_ok:
                text_fails.append(
                    vf.attach_fix(
                        {
                            "layer_id": t.layer_id,
                            "min_ratio_sampled": round(min_ratio, 3) if min_ratio != math.inf else None,
                            "min_ratio_declared": round(declared_ratio, 3) if declared_ratio != math.inf else None,
                            "required": need,
                            "worst_background_sample": worst_bg,
                            "contrast_sample_source": sample_source,
                        },
                        vf.fix_contrast_text(t.layer_id),
                    )
                )
            elif not sampled_ok and declared_ok:
                contrast_detail.setdefault("sampled_only_warnings", []).append(t.layer_id)
        contrast_ok = not text_fails
        contrast_detail["violations"] = text_fails
    else:
        contrast_detail = {
            "skipped": True,
            "reason": f"PNG {info.width}x{info.height} != panel {panel.panel_width}x{panel.panel_height}",
        }
    checks.append({"id": "text_contrast_background", "ok": contrast_ok, "detail": contrast_detail})

    # background_not_default_gray
    gray_bad = []
    if opt.strict_default_gray_background and png_matches_panel:
        for hx in image_io.panel_edge_hexes(img):
            if hx.lower() in DEFAULT_GRAY_HEXES:
                gray_bad.append({"edge_sample": hx, "reason": "default_gray_edge"})
                break
    checks.append(
        {
            "id": "background_not_default_gray",
            "ok": not gray_bad,
            "detail": {"violations": gray_bad},
        }
    )

    # PNG pixel checks
    ink_bad = []
    empty_bad = []
    device_blank_bad = []
    if png_matches_panel:
        if opt.strict_ink_margins:
            for t in texts:
                left, top, right, bottom = _text_bbox(t)
                for edge_name, coord in (
                    ("left", left),
                    ("right", right),
                    ("top", top),
                    ("bottom", bottom),
                ):
                    if edge_name in ("left", "right") and coord < m + 4:
                        ink_bad.append(
                            vf.attach_fix(
                                {
                                    "layer_id": t.layer_id,
                                    "edge": edge_name,
                                    "coord": round(coord, 2),
                                },
                                vf.fix_margin_violation(
                                    {
                                        "layer_id": t.layer_id,
                                        f"{edge_name}_short_by_px": m - coord + 4
                                        if edge_name == "left"
                                        else 0,
                                        f"{'right_past_by_px' if edge_name == 'right' else 'bottom_past_by_px'}": coord
                                        - (pw - m) + 4
                                        if edge_name == "right"
                                        else 0,
                                    },
                                    panel_index=pidx,
                                ),
                            )
                        )
        w, h = img.size

        def _band_is_light_flat(box: tuple[int, int, int, int]) -> bool:
            li, ti, ri, bi = box
            frac = (ri - li) / w if w else (bi - ti) / h if h else 0
            if frac < 0.08:
                return False
            var = image_io.region_luminance_variance(img, li, ti, ri, bi)
            if var >= 8.0:
                return False
            hx = image_io.region_hex(img, li, ti, ri, bi)
            if hx.lower() in DEFAULT_GRAY_HEXES:
                return True
            r, g, b = int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            return lum >= 220.0

        for box in image_io.panel_edge_strip_boxes(w, h):
            if _band_is_light_flat(box):
                li, ti, ri, bi = box
                empty_bad.append(
                    {
                        "region": [li, ti, ri, bi],
                        "variance": round(image_io.region_luminance_variance(img, li, ti, ri, bi), 2),
                        "mean_hex": image_io.region_hex(img, li, ti, ri, bi),
                    }
                )
        for d in devices:
            l, t, r, b = _device_bbox(d)
            li, ti, ri, bi = int(l), int(t), int(r), int(b)
            if ri <= li or bi <= ti:
                continue
            inner_var = image_io.region_luminance_variance(img, li, ti, ri, bi)
            edge_var = sum(
                image_io.region_luminance_variance(img, *box)
                for box in image_io.panel_edge_strip_boxes(w, h)[:2]
            ) / 2.0
            if inner_var < 12.0 and inner_var < edge_var * 0.15:
                device_blank_bad.append(
                    vf.attach_fix(
                        {
                            "layer_id": d.layer_id,
                            "inner_variance": round(inner_var, 2),
                            "edge_variance": round(edge_var, 2),
                        },
                        vf.fix_device_size_delta(d.layer_id, 24),
                    )
                )
    checks.append(
        {
            "id": "text_ink_inside_safe_area",
            "ok": not ink_bad,
            "detail": {"strict_ink_margins": opt.strict_ink_margins, "violations": ink_bad},
        }
    )
    checks.append(
        {"id": "panel_empty_margin_bands", "ok": not empty_bad, "detail": {"violations": empty_bad}}
    )
    checks.append(
        {
            "id": "device_region_not_blank",
            "ok": not device_blank_bad,
            "detail": {"violations": device_blank_bad},
        }
    )
    ok_all = png_ok and all(c["ok"] for c in checks)
    result = {"ok": ok_all, "phase": "rules", "checks": checks, "panel_index": pidx}
    return _maybe_emit_fixes_only(result, emit_fixes_only)


def _maybe_emit_fixes_only(result: dict[str, Any], emit_fixes_only: bool) -> dict[str, Any]:
    if not emit_fixes_only:
        return result
    fixes: list[dict[str, Any]] = []
    for chk in result.get("checks", []):
        if chk.get("ok"):
            continue
        detail = chk.get("detail") or {}
        for key in ("violations", "violations_detail"):
            items = detail.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, dict) and "suggested_fix" in item:
                    fixes.append({"check_id": chk["id"], **item["suggested_fix"]})
    return {"ok": result.get("ok"), "phase": "rules", "fixes": fixes, "checks": result.get("checks")}


def merge_cli_options(
    profile_opt: ValidateRulesOptions,
    ns: Any,
) -> ValidateRulesOptions:
    """Merge argparse namespace overrides onto profile panel options."""

    def pick_float(name: str, current: float) -> float:
        val = getattr(ns, name, None)
        return current if val is None else float(val)

    def pick_int(name: str, current: int) -> int:
        val = getattr(ns, name, None)
        return current if val is None else int(val)

    return ValidateRulesOptions(
        margin_frac=pick_float("margin_frac", profile_opt.margin_frac),
        margin_floor_px=pick_int("margin_floor_px", profile_opt.margin_floor_px),
        margin_max_px=pick_float("margin_max_px", profile_opt.margin_max_px),
        margin_tolerance_px=pick_float("margin_tolerance_px", profile_opt.margin_tolerance_px),
        margin_text_bbox_shrink_px=pick_float(
            "margin_text_bbox_shrink_px", profile_opt.margin_text_bbox_shrink_px
        ),
        margin_text_horizontal_extra_px=pick_float(
            "margin_text_horizontal_extra_px", profile_opt.margin_text_horizontal_extra_px
        ),
        max_text_span=pick_float("max_text_span", profile_opt.max_text_span),
        min_device_height_ratio=pick_float("min_device_height_ratio", profile_opt.min_device_height_ratio),
        max_device_height_ratio=pick_float("max_device_height_ratio", profile_opt.max_device_height_ratio),
        max_device_pair_overlap=pick_float("max_device_pair_overlap", profile_opt.max_device_pair_overlap),
        min_contrast_normal=pick_float("min_contrast_normal", profile_opt.min_contrast_normal),
        min_contrast_large=pick_float("min_contrast_large", profile_opt.min_contrast_large),
        large_text_size_px=pick_float("large_text_size_px", profile_opt.large_text_size_px),
        min_text_font_size_px=pick_float("min_text_font_size_px", profile_opt.min_text_font_size_px),
        text_unwanted_wrap_height_to_size_ratio=pick_float(
            "text_unwanted_wrap_height_to_size_ratio",
            profile_opt.text_unwanted_wrap_height_to_size_ratio,
        ),
        min_text_gap_px=pick_float("min_text_gap_px", profile_opt.min_text_gap_px),
        max_text_device_gap_frac=pick_float(
            "max_text_device_gap_frac", profile_opt.max_text_device_gap_frac
        ),
        max_text_device_gap_px=pick_float("max_text_device_gap_px", profile_opt.max_text_device_gap_px),
        require_device_center_x=profile_opt.require_device_center_x,
        device_center_tolerance_px=pick_float(
            "device_center_tolerance_px", profile_opt.device_center_tolerance_px
        ),
        strict_ink_margins=profile_opt.strict_ink_margins,
        strict_default_gray_background=profile_opt.strict_default_gray_background,
        enable_text_preset_size_band=profile_opt.enable_text_preset_size_band,
        min_theme_contrast=pick_float("min_theme_contrast", profile_opt.min_theme_contrast),
    )
