"""Non-vision panel preview validation (PNG + optional agent panel JSON v1)."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from core.constants import MIN_CONTRAST
from image import color as color_mod
from image import image_io


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
    panels: list[PanelEntry]


@dataclass(frozen=True)
class ValidateRulesOptions:
    margin_frac: float = 0.04
    margin_floor_px: int = 8
    # Cap nominal margin (0 = no cap). Without a cap, 4% of short side on App Store panels is ~52px.
    margin_max_px: float = 48.0
    # Slack subtracted after cap (Fabric text AABB vs ink, rounding).
    margin_tolerance_px: float = 16.0
    # Symmetric inset of text AABB for margin check only (preview bbox often pads glyphs).
    margin_text_bbox_shrink_px: float = 18.0
    # Extra left/right inset only (wide shallow Textbox: old min(w,h)/2 cap starved horizontal shrink).
    margin_text_horizontal_extra_px: float = 16.0
    max_text_span: float = 0.94
    min_device_height_ratio: float = 0.50
    max_device_height_ratio: float = 0.90
    max_device_pair_overlap: float = 0.15
    min_contrast_normal: float = MIN_CONTRAST
    min_contrast_large: float = 3.0
    large_text_size_px: float = 24.0
    # Readability floor for text layers (0 = disable check).
    min_text_font_size_px: float = 48.0
    # If content has no explicit newline but bbox is this tall vs font size, flag likely unintended wrap (0 = disable).
    text_unwanted_wrap_height_to_size_ratio: float = 1.8


def _text_bbox(layer: TextLayer) -> tuple[float, float, float, float]:
    return (layer.x, layer.y, layer.x + layer.width, layer.y + layer.height)


def _text_bbox_for_margin(
    layer: TextLayer,
    shrink: float,
    horizontal_extra: float,
) -> tuple[float, float, float, float]:
    """
    Inset text AABB for margin rules. Uses separate horizontal vs vertical caps so
    wide shallow boxes (large width, small height) are not limited to h/2 shrink on X.
    """
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


def _intersection_area(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    dx = min(a[2], b[2]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[1], b[1])
    if dx <= 0 or dy <= 0:
        return 0.0
    return float(dx * dy)


def _touches_only(a: tuple[float, float, float, float], b: tuple[float, float, float, float], eps: float = 1e-3) -> bool:
    area = _intersection_area(a, b)
    return area > eps


def _margin_inset_for_check(panel_w: int, panel_h: int, opt: ValidateRulesOptions) -> tuple[float, float, float]:
    """
    Returns (margin_nominal_px, margin_capped_px, margin_inset_px).

    margin_nominal_px: max(floor, frac * min(w,h)).
    margin_capped_px: after optional margin_max_px cap.
    margin_inset_px: what we enforce (capped minus tolerance), floored at 0.
    """
    short = float(min(panel_w, panel_h))
    base = opt.margin_frac * short
    m_nominal = max(float(opt.margin_floor_px), base)
    m_capped = m_nominal
    if opt.margin_max_px > 0:
        m_capped = min(m_capped, float(opt.margin_max_px))
    m_check = max(0.0, m_capped - float(opt.margin_tolerance_px))
    return m_nominal, m_capped, m_check


def _background_sample_hexes(img: Image.Image) -> list[str]:
    """Edge-strip mean colors (fallback when local halo around text is unavailable)."""
    w, h = img.size
    if w < 2 or h < 2:
        return [image_io.region_hex(img, 0, 0, w, h)]
    strip = max(2, min(24, w // 24, h // 24))
    boxes = [
        (0, 0, w, strip),
        (0, h - strip, w, h),
        (0, 0, strip, h),
        (w - strip, 0, w, h),
    ]
    out: list[str] = []
    for left, top, right, bottom in boxes:
        if right <= left or bottom <= top:
            continue
        out.append(image_io.region_hex(img, int(left), int(top), int(right), int(bottom)))
    return out


def _local_halo_strip_hexes(
    img: Image.Image,
    left: float,
    top: float,
    right: float,
    bottom: float,
    pad: int,
) -> list[str]:
    """
    Mean colors in thin strips *outside* the text AABB (same panel coords as the PNG).

    This approximates the pixels adjacent to the glyphs. Panel-edge-only sampling
    (see _background_sample_hexes) is too pessimistic for centered hero text on a
    dark field when the status bar / gradient corner reads light gray.
    """
    w, h = img.size
    li = int(max(0, min(w, round(left))))
    ti = int(max(0, min(h, round(top))))
    ri = int(max(0, min(w, round(right))))
    bi = int(max(0, min(h, round(bottom))))
    if ri <= li or bi <= ti:
        return []
    p = max(1, pad)
    out: list[str] = []
    # Top: above the box
    t0, t1 = max(0, ti - p), ti
    if t1 > t0 and ri > li:
        out.append(image_io.region_hex(img, li, t0, ri, t1))
    # Bottom: below the box
    b0, b1 = bi, min(h, bi + p)
    if b1 > b0 and ri > li:
        out.append(image_io.region_hex(img, li, b0, ri, b1))
    # Left
    l0, l1 = max(0, li - p), li
    if l1 > l0 and bi > ti:
        out.append(image_io.region_hex(img, l0, ti, l1, bi))
    # Right
    r0, r1 = ri, min(w, ri + p)
    if r1 > r0 and bi > ti:
        out.append(image_io.region_hex(img, r0, ti, r1, bi))
    return out


def _min_contrast_for_text(size: float, opt: ValidateRulesOptions) -> float:
    return opt.min_contrast_large if size >= opt.large_text_size_px else opt.min_contrast_normal


def _text_suspects_unwanted_wrap(layer: TextLayer, opt: ValidateRulesOptions) -> bool:
    if opt.text_unwanted_wrap_height_to_size_ratio <= 0:
        return False
    body = (layer.content or "").replace("\r\n", "\n")
    if "\n" in body:
        return False
    if not body.strip():
        return False
    if layer.size <= 0:
        return False
    return (layer.height / layer.size) >= opt.text_unwanted_wrap_height_to_size_ratio + 1e-9


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


def run_validate_rules(
    png_path: Path,
    panel_data_path: Path | None,
    panel_index: int | None,
    canvas_size: str | None,
    preset_id: str | None,
    opt: ValidateRulesOptions | None = None,
) -> dict[str, Any]:
    opt = opt or ValidateRulesOptions()
    checks: list[dict[str, Any]] = []

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
                "ok": True,
                "detail": "skipped: no --panel-data; geometry/contrast rules not run",
            }
        )
        ok_all = png_ok
        return {"ok": ok_all, "phase": "rules", "checks": checks}

    data = load_panel_preview(panel_data_path)
    if data.version != 1:
        checks.append(
            {
                "id": "panel_data_version",
                "ok": False,
                "detail": f"expected version 1, got {data.version}",
            }
        )
        ok_all = png_ok and False
        return {"ok": ok_all, "phase": "rules", "checks": checks}

    panel, err = _resolve_panel(data, panel_index)
    if err:
        checks.append({"id": "panel_resolve", "ok": False, "detail": err})
        return {"ok": False, "phase": "rules", "checks": checks}
    assert panel is not None

    pw, ph = float(panel.panel_width), float(panel.panel_height)
    m_nominal, m_capped, m = _margin_inset_for_check(panel.panel_width, panel.panel_height, opt)

    texts = [ly for ly in panel.layers if isinstance(ly, TextLayer)]
    devices = [ly for ly in panel.layers if isinstance(ly, DeviceLayer)]

    # text_no_overlap
    text_overlap_ok = True
    overlap_pairs: list[str] = []
    for i, a in enumerate(texts):
        ba = _text_bbox(a)
        for b in texts[i + 1 :]:
            bb = _text_bbox(b)
            if _touches_only(ba, bb):
                text_overlap_ok = False
                overlap_pairs.append(f"{a.layer_id} vs {b.layer_id}")
    checks.append(
        {
            "id": "text_no_overlap",
            "ok": text_overlap_ok,
            "detail": {"overlapping_pairs": overlap_pairs} if overlap_pairs else {},
        }
    )

    # text_safe_margins
    margin_violations: list[str] = []
    margin_violation_details: list[dict[str, Any]] = []
    for t in texts:
        left, top, right, bottom = _text_bbox_for_margin(
            t,
            opt.margin_text_bbox_shrink_px,
            opt.margin_text_horizontal_extra_px,
        )
        if left < m - 1e-6 or top < m - 1e-6 or right > pw - m + 1e-6 or bottom > ph - m + 1e-6:
            margin_violations.append(t.layer_id)
            margin_violation_details.append(
                _margin_violation_detail(t.layer_id, left, top, right, bottom, pw, ph, m),
            )
    margin_detail: dict[str, Any] = {
        "margin_px": round(m, 2),
        "margin_nominal_px": round(m_nominal, 2),
        "margin_capped_px": round(m_capped, 2),
        "margin_max_px": opt.margin_max_px,
        "margin_tolerance_px": opt.margin_tolerance_px,
        "margin_text_bbox_shrink_px": opt.margin_text_bbox_shrink_px,
        "margin_text_horizontal_extra_px": opt.margin_text_horizontal_extra_px,
        "violations": margin_violations,
    }
    if margin_violation_details:
        margin_detail["violations_detail"] = margin_violation_details
    checks.append(
        {
            "id": "text_safe_margins",
            "ok": not margin_violations,
            "detail": margin_detail,
        },
    )

    # text_span_sensible
    span_bad: list[dict[str, Any]] = []
    for t in texts:
        ratio = (t.width / pw) if pw > 0 else 999.0
        if ratio > opt.max_text_span + 1e-9:
            span_bad.append({"layer_id": t.layer_id, "width_ratio": round(ratio, 4)})
    checks.append(
        {
            "id": "text_span_sensible",
            "ok": not span_bad,
            "detail": {"max_span": opt.max_text_span, "violations": span_bad},
        }
    )

    # text_font_min_size — panel JSON doesn't know font metrics; uses declared font size vs floor.
    min_size_bad: list[dict[str, Any]] = []
    if opt.min_text_font_size_px > 0:
        need = opt.min_text_font_size_px
        for t in texts:
            if t.size + 1e-9 < need:
                min_size_bad.append(
                    {
                        "layer_id": t.layer_id,
                        "size": round(t.size, 3),
                        "min_required_px": round(need, 3),
                        "short_by_px": round(max(0.0, need - t.size), 3),
                    }
                )
    checks.append(
        {
            "id": "text_font_min_size",
            "ok": not min_size_bad,
            "detail": {
                "min_text_font_size_px": opt.min_text_font_size_px,
                "violations": min_size_bad,
            },
        },
    )

    # text_single_line_bbox — heuristic: tall box vs font size without explicit newline ⇒ likely wrapped.
    wrap_bad: list[dict[str, Any]] = []
    if opt.text_unwanted_wrap_height_to_size_ratio > 0:
        thr = opt.text_unwanted_wrap_height_to_size_ratio
        for t in texts:
            if not _text_suspects_unwanted_wrap(t, opt):
                continue
            wrap_bad.append(
                {
                    "layer_id": t.layer_id,
                    "height_px": round(t.height, 3),
                    "size_px": round(t.size, 3),
                    "height_to_size": round((t.height / t.size) if t.size > 0 else 0.0, 4),
                    "max_ratio_for_single_line_estimate": thr,
                    "content_preview": (t.content.replace("\r\n", " ").replace("\n", " ")[:80] + "…")
                    if len(t.content) > 80
                    else t.content,
                }
            )
    checks.append(
        {
            "id": "text_single_line_bbox",
            "ok": not wrap_bad,
            "detail": {
                "height_to_size_ratio_threshold": opt.text_unwanted_wrap_height_to_size_ratio,
                "violations": wrap_bad,
            },
        },
    )

    # text_device_no_overlap
    td_bad: list[str] = []
    for t in texts:
        tb = _text_bbox(t)
        for d in devices:
            db = _device_bbox(d)
            if _touches_only(tb, db):
                td_bad.append(f"{t.layer_id} vs {d.layer_id}")
    checks.append(
        {
            "id": "text_device_no_overlap",
            "ok": not td_bad,
            "detail": {"pairs": td_bad},
        }
    )

    # device_height_band
    dh_bad: list[dict[str, Any]] = []
    for d in devices:
        r = (d.height / ph) if ph > 0 else 0.0
        if r < opt.min_device_height_ratio - 1e-9 or r > opt.max_device_height_ratio + 1e-9:
            dh_bad.append(
                {
                    "layer_id": d.layer_id,
                    "height_ratio": round(r, 4),
                    "allowed": [opt.min_device_height_ratio, opt.max_device_height_ratio],
                }
            )
    checks.append(
        {
            "id": "device_height_band",
            "ok": not dh_bad,
            "detail": {"violations": dh_bad},
        }
    )

    # device_pairs_low_overlap
    pair_bad: list[dict[str, Any]] = []
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
                        {
                            "a": da.layer_id,
                            "b": db_ly.layer_id,
                            "overlap_fraction": round(frac, 4),
                            "max_allowed": opt.max_device_pair_overlap,
                        }
                    )
    checks.append(
        {
            "id": "device_pairs_low_overlap",
            "ok": not pair_bad,
            "detail": {"violations": pair_bad},
        }
    )

    # text_contrast_background (needs PNG panel geometry match)
    contrast_ok = True
    contrast_detail: dict[str, Any] = {}
    if info.width == panel.panel_width and info.height == panel.panel_height:
        edge_hexes = _background_sample_hexes(img)
        contrast_detail["edge_background_samples"] = edge_hexes
        halo_pad = max(8, min(48, int(min(pw, ph) * 0.02)))
        contrast_detail["local_halo_pad_px"] = halo_pad
        text_fails: list[dict[str, Any]] = []
        for t in texts:
            if not color_mod.is_hex_color(t.color.strip()):
                text_fails.append({"layer_id": t.layer_id, "reason": "invalid_text_color", "color": t.color})
                continue
            left, top, right, bottom = _text_bbox(t)
            local_hexes = _local_halo_strip_hexes(img, left, top, right, bottom, halo_pad)
            # Prefer strips adjacent to the text in the PNG; fall back to panel edges if no halo (degenerate bbox).
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
            if min_ratio < need:
                text_fails.append(
                    {
                        "layer_id": t.layer_id,
                        "min_ratio": round(min_ratio, 3) if min_ratio != math.inf else None,
                        "required": need,
                        "worst_background_sample": worst_bg,
                        "contrast_sample_source": sample_source,
                        "background_samples_used": bg_hexes,
                    }
                )
        contrast_ok = not text_fails
        contrast_detail["violations"] = text_fails
    else:
        contrast_ok = True
        contrast_detail = {
            "skipped": True,
            "reason": f"PNG {info.width}x{info.height} != panel {panel.panel_width}x{panel.panel_height}",
        }
    checks.append({"id": "text_contrast_background", "ok": contrast_ok, "detail": contrast_detail})

    ok_all = png_ok and all(c["ok"] for c in checks)
    return {"ok": ok_all, "phase": "rules", "checks": checks}
