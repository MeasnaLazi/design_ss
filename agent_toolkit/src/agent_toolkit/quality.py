from __future__ import annotations

from dataclasses import dataclass

from agent_toolkit.color import contrast_ratio, is_hex_color
from agent_toolkit.constants import (
    DEVICE_MAX_CANVAS_HEIGHT_RATIO,
    DEVICE_MIN_CANVAS_HEIGHT_RATIO,
    MIN_CONTRAST,
    MIN_HEADLINE_SIZE,
)
from agent_toolkit.geometry import rects_overlap
from agent_toolkit.models import BackgroundModel, DeviceLayerModel, SessionCheckInput, TextLayerModel
from agent_toolkit.safe import layer_within_canvas, text_in_safe_zone


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
    """Mirror qualityChecks(session) in screenshot-designer-server.ts."""
    errors: list[str] = []
    contrast_issues: list[ContrastIssue] = []
    w, h = session.width, session.height

    text_layers: list[TextLayerModel] = [L for L in session.layers if L.kind == "text"]
    devices: list[DeviceLayerModel] = [L for L in session.layers if L.kind == "device_frame"]

    for text in text_layers:
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
