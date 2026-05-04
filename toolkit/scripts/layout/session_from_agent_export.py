"""Map Web UI ``AgentLayoutSummaryV1`` (designer ``pull-export``) to ``SessionCheckInput`` for ``predict-checks``."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from core.models import (
    BackgroundModel,
    DeviceLayerModel,
    GradientStopModel,
    GradientValueModel,
    SessionCheckInput,
    TextLayerModel,
)


def export_summary_to_session_check(summary: dict[str, Any]) -> SessionCheckInput:
    """
    Convert ``buildAgentLayoutSummaryFromCanvas`` / ``pull-export`` JSON into
    :class:`SessionCheckInput` for :func:`layout.quality.predict_checks`.

    Only **text** and **device** (→ ``device_frame``) layers are forwarded; other
    kinds are skipped. Requires ``layoutSummaryVersion`` == 1.
    """
    if summary.get("error"):
        raise ValueError(f"export summary has error: {summary.get('error')}")
    ver = summary.get("layoutSummaryVersion")
    if ver != 1:
        raise ValueError(f"layoutSummaryVersion must be 1, got {ver!r}")

    canvas = summary.get("canvas")
    layout = summary.get("layout")
    layers_raw = summary.get("layers")
    bg_raw = summary.get("background")
    if not isinstance(canvas, dict) or not isinstance(layout, dict):
        raise ValueError("export summary missing canvas or layout")
    if not isinstance(layers_raw, list):
        layers_raw = []

    w = int(canvas["width"])
    h = int(canvas["height"])
    screens = max(1, int(layout.get("screens") or 1))
    gap = max(0, int(layout.get("gap") or 0))

    bg = _background_model_from_export(bg_raw)

    layers: list[TextLayerModel | DeviceLayerModel] = []
    for row in layers_raw:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "")
        lid = str(row.get("layer_id") or row.get("id") or "")
        if not lid:
            continue
        lx = float(row.get("left", 0))
        ly = float(row.get("top", 0))
        lw = float(row.get("width", 0))
        lh = float(row.get("height", 0))

        if kind == "text":
            layers.append(
                TextLayerModel(
                    id=lid,
                    x=lx,
                    y=ly,
                    width=lw,
                    height=lh,
                    content=str(row.get("text") or ""),
                    size=float(row.get("fontSize") or 32),
                    color=str(row.get("fill") or "#000000"),
                )
            )
        elif kind == "device":
            layers.append(
                DeviceLayerModel(
                    id=lid,
                    x=lx,
                    y=ly,
                    width=lw,
                    height=lh,
                )
            )

    return SessionCheckInput(width=w, height=h, background=bg, layers=layers, screens=screens, gap=gap)


def _background_model_from_export(bg_raw: Any) -> BackgroundModel:
    if not isinstance(bg_raw, dict):
        return BackgroundModel(type="color", value="#111111")
    t = str(bg_raw.get("type") or "solid")
    if t == "solid":
        color = str(bg_raw.get("color") or "#111111")
        return BackgroundModel(type="color", value=color)
    if t == "gradient":
        stops_in = bg_raw.get("stops") or []
        stops: list[GradientStopModel] = []
        for s in stops_in:
            if not isinstance(s, dict):
                continue
            try:
                off = float(s.get("offset", 0))
                stops.append(GradientStopModel(offset=off, color=str(s.get("color") or "#000000")))
            except ValidationError:
                continue
        if len(stops) < 2:
            return BackgroundModel(type="color", value="#111111")
        angle = float(bg_raw.get("angleDeg", bg_raw.get("angle", 180)))
        gv = GradientValueModel(angleDeg=angle, stops=stops)
        return BackgroundModel(type="gradient", value=gv)
    if t == "image":
        url = str(bg_raw.get("url") or "")
        return BackgroundModel(type="image", value=url)
    return BackgroundModel(type="color", value="#111111")
