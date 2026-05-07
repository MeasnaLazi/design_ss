from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from image.color import contrast_ratio, is_hex_color
from core.constants import (
    DEVICE_MAX_CANVAS_HEIGHT_RATIO,
    DEVICE_MIN_CANVAS_HEIGHT_RATIO,
    MAX_DEVICE_PAIR_IOU,
    MIN_CONTRAST,
    MIN_HEADLINE_SIZE,
    TEXT_MAX_PANEL_WIDTH_RATIO,
    TEXT_MIN_PANEL_WIDTH_RATIO,
)
from layout.geometry import (
    dominant_panel_index_for_rect,
    panel_rect,
    rect_iou,
    rects_overlap,
    strip_panel_width,
)
from core.models import BackgroundModel, DeviceLayerModel, SessionCheckInput, TextLayerModel
from layout.safe import (
    layer_within_canvas,
    text_in_multi_panel_strip_safe_zone,
    text_in_safe_zone,
)


@dataclass
class ContrastIssue:
    layer_id: str
    ratio: float


@dataclass
class QualityResult:
    ok: bool
    errors: list[str]
    contrast_issues: list[ContrastIssue]

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "errors": list(self.errors),
            "contrastIssues": [
                {"layerId": c.layer_id, "contrastRatio": c.ratio} for c in self.contrast_issues
            ],
        }


def _bg_for_contrast(background: BackgroundModel) -> str:
    if background.type == "color" and isinstance(background.value, str) and is_hex_color(background.value):
        return background.value
    return "#111111"


def predict_checks(session: SessionCheckInput) -> QualityResult:
    """Layout-side quality gate (CLI ``predict-checks``).

    Checks safe-zone, canvas bounds, contrast, headline-size heuristic, device height
    ratios (vs ``session.height``), text block horizontal span vs panel width band,
    pairwise device Jaccard IoU, text–device overlap, optional single-column text stack
    (``require_text_single_panel``), and **text–text bbox overlap within the same strip
    column** (when ``screens`` > 1, grouping uses ``dominant_panel_index_for_rect``).
    """
    errors: list[str] = []
    contrast_issues: list[ContrastIssue] = []
    w, h = session.width, session.height
    screens_ct = session.screens
    gap_px = session.gap

    text_layers: list[TextLayerModel] = [L for L in session.layers if L.kind == "text"]
    devices: list[DeviceLayerModel] = [L for L in session.layers if L.kind == "device_frame"]
    panel_w = strip_panel_width(float(w), screens_ct, float(gap_px))

    for text in text_layers:
        if screens_ct > 1:
            ok_safe, _ = text_in_multi_panel_strip_safe_zone(
                text.x, text.y, text.width, text.height, w, h, screens_ct, gap_px
            )
        else:
            ok_safe, _ = text_in_safe_zone(text.x, text.y, text.width, text.height, w, h)
        if not ok_safe:
            errors.append(f"Text layer {text.id} is outside safe zones.")
        if not layer_within_canvas(text.x, text.y, text.width, text.height, w, h):
            errors.append(f"Text layer {text.id} is outside canvas bounds.")

        bg_for = _bg_for_contrast(session.background)
        if is_hex_color(text.color) and is_hex_color(bg_for):
            cr = contrast_ratio(text.color, bg_for)
            if cr < MIN_CONTRAST:
                contrast_issues.append(ContrastIssue(text.id, round(cr, 2)))

        words = text.content.strip().split()
        if text.size < MIN_HEADLINE_SIZE and len(words) <= 6:
            errors.append(
                f"Headline-like text layer {text.id} must be at least {MIN_HEADLINE_SIZE}px.",
            )

        dom_pi = dominant_panel_index_for_rect(
            text.x,
            text.y,
            text.width,
            text.height,
            float(w),
            float(h),
            screens_ct,
            float(gap_px),
        )
        if dom_pi is not None and panel_w > 0:
            pl, _pt, ppw, _ph = panel_rect(dom_pi, float(gap_px), panel_w, float(h))
            ix = max(0.0, min(text.x + text.width, pl + ppw) - max(text.x, pl))
            span_ratio = ix / panel_w
            if span_ratio < TEXT_MIN_PANEL_WIDTH_RATIO or span_ratio > TEXT_MAX_PANEL_WIDTH_RATIO:
                errors.append(
                    f"Text layer {text.id} horizontal span in its dominant panel must be "
                    f"{int(TEXT_MIN_PANEL_WIDTH_RATIO * 100)}-{int(TEXT_MAX_PANEL_WIDTH_RATIO * 100)}% "
                    f"of panel width (got {round(span_ratio * 100, 1)}%).",
                )

    for device in devices:
        ratio = device.height / h
        if ratio < DEVICE_MIN_CANVAS_HEIGHT_RATIO or ratio > DEVICE_MAX_CANVAS_HEIGHT_RATIO:
            errors.append(
                f"Device layer {device.id} must occupy "
                f"{int(DEVICE_MIN_CANVAS_HEIGHT_RATIO * 100)}-"
                f"{int(DEVICE_MAX_CANVAS_HEIGHT_RATIO * 100)}% of canvas height.",
            )
        if not layer_within_canvas(device.x, device.y, device.width, device.height, w, h):
            errors.append(f"Device layer {device.id} is outside canvas bounds.")

    for i in range(len(devices)):
        for j in range(i + 1, len(devices)):
            a, b = devices[i], devices[j]
            iou = rect_iou(
                a.x,
                a.y,
                a.width,
                a.height,
                b.x,
                b.y,
                b.width,
                b.height,
            )
            if iou > MAX_DEVICE_PAIR_IOU:
                errors.append(
                    f"Device layers {a.id} and {b.id} overlap too much "
                    f"(IoU {round(iou, 2)}; max {MAX_DEVICE_PAIR_IOU}).",
                )

    if session.require_text_single_panel and screens_ct > 1 and len(text_layers) > 1:
        dom_pis: list[int | None] = []
        for t in text_layers:
            dom_pis.append(
                dominant_panel_index_for_rect(
                    t.x,
                    t.y,
                    t.width,
                    t.height,
                    float(w),
                    float(h),
                    screens_ct,
                    float(gap_px),
                )
            )
        if any(p is None for p in dom_pis):
            for t, p in zip(text_layers, dom_pis):
                if p is None:
                    errors.append(
                        f"Text layer {t.id} does not resolve to a strip column "
                        "(required for single-panel text stack).",
                    )
        elif len(set(dom_pis)) > 1:
            errors.append(
                "Text layers must all sit in the same strip column when "
                "require_text_single_panel is true.",
            )

    for text in text_layers:
        for device in devices:
            if rects_overlap(
                text.x,
                text.y,
                text.width,
                text.height,
                device.x,
                device.y,
                device.width,
                device.height,
            ):
                errors.append(f"Text layer {text.id} overlaps device frame {device.id}.")

    # Pairwise text–text overlap within the same strip column (panel-local story).
    by_panel: dict[int | str, list[TextLayerModel]] = defaultdict(list)
    for t in text_layers:
        pi = dominant_panel_index_for_rect(
            t.x,
            t.y,
            t.width,
            t.height,
            float(w),
            float(h),
            screens_ct,
            float(gap_px),
        )
        key: int | str = pi if pi is not None else "__no_panel__"
        by_panel[key].append(t)
    for _key, group in by_panel.items():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if rects_overlap(
                    a.x,
                    a.y,
                    a.width,
                    a.height,
                    b.x,
                    b.y,
                    b.width,
                    b.height,
                ):
                    errors.append(
                        f"Text layer {a.id} overlaps text layer {b.id} in the same strip column.",
                    )

    if contrast_issues:
        errors.append("One or more text layers fail minimum contrast ratio 4.5:1.")

    return QualityResult(ok=len(errors) == 0, errors=errors, contrast_issues=contrast_issues)


def explain_failure(result: QualityResult) -> str:
    if result.ok:
        return "ok"
    parts = list(result.errors)
    for c in result.contrast_issues:
        parts.append(f"contrast {c.layer_id}: {c.ratio}:1")
    return " | ".join(parts)


def preview_budget(render_count: int, max_renders: int = 4) -> dict[str, int | bool]:
    used = max(0, render_count)
    remaining = max(0, max_renders - used)
    return {
        "used": used,
        "remaining": remaining,
        "max": max_renders,
        "would_exceed": used >= max_renders,
    }
