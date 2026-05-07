from __future__ import annotations

from typing import Literal

from core.constants import DESIGN_GRID

Anchor = Literal["center_x", "center_y", "top", "bottom", "left", "right"]


def rects_overlap(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
) -> bool:
    """Mirror rectsOverlap in screenshot-designer-server.ts."""
    return not (
        ax + aw <= bx
        or bx + bw <= ax
        or ay + ah <= by
        or by + bh <= ay
    )


def rect_intersection_area(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
) -> float:
    """Area of axis-aligned intersection of two rectangles (0 if disjoint)."""
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    return ix * iy


def rect_iou(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
) -> float:
    """Jaccard index (intersection / union) for two axis-aligned rectangles."""
    inter = rect_intersection_area(ax, ay, aw, ah, bx, by, bw, bh)
    union = aw * ah + bw * bh - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def strip_panel_width(strip_width: float, screens: int, gap: float) -> float:
    """Usable width of one column on a horizontal strip (mirrors export_slice / web_ui)."""
    if screens < 1:
        raise ValueError("screens must be >= 1")
    return (float(strip_width) - float(gap) * float(screens - 1)) / float(screens)


def dominant_panel_index_for_rect(
    x: float,
    y: float,
    w: float,
    h: float,
    strip_width: float,
    strip_height: float,
    screens: int,
    gap: float,
) -> int | None:
    """
    Which strip column contains the most overlap area with the given axis-aligned rect.
    Returns None if the rect does not overlap any column interior (e.g. wholly in a gutter).
    """
    panel_w = strip_panel_width(strip_width, screens, gap)
    best_i: int | None = None
    best_area = 0.0
    for i in range(screens):
        pl, pt, pw, ph = panel_rect(i, gap, panel_w, strip_height)
        ox = max(0.0, min(x + w, pl + pw) - max(x, pl))
        oy = max(0.0, min(y + h, pt + ph) - max(y, pt))
        area = ox * oy
        if area > best_area:
            best_area = area
            best_i = i
    if best_i is None or best_area <= 0.0:
        return None
    return best_i


def panel_rect(index: int, gap: float, panel_w: float, panel_h: float) -> tuple[float, float, float, float]:
    """
    Top-left and size of one column on the horizontal strip (mirrors web_ui screenExportRect).
    Returns (left, top, width, height).
    """
    left = float(index) * (float(panel_w) + float(gap))
    return left, 0.0, float(panel_w), float(panel_h)


def align_layer(
    layer_x: float,
    layer_y: float,
    layer_width: float,
    layer_height: float,
    anchor: Anchor,
    ref_x: float,
    ref_y: float,
    ref_width: float,
    ref_height: float,
) -> tuple[int, int]:
    """
    Mirror align operation: compute new x,y for layer top-left given anchor to ref rect,
    then snap to DESIGN_GRID (same formula as TS).
    """
    lx, ly = layer_x, layer_y
    if anchor == "center_x":
        lx = round((ref_x + ref_width / 2 - layer_width / 2) / DESIGN_GRID) * DESIGN_GRID
    elif anchor == "center_y":
        ly = round((ref_y + ref_height / 2 - layer_height / 2) / DESIGN_GRID) * DESIGN_GRID
    elif anchor == "top":
        ly = round(ref_y / DESIGN_GRID) * DESIGN_GRID
    elif anchor == "bottom":
        ly = round((ref_y + ref_height - layer_height) / DESIGN_GRID) * DESIGN_GRID
    elif anchor == "left":
        lx = round(ref_x / DESIGN_GRID) * DESIGN_GRID
    elif anchor == "right":
        lx = round((ref_x + ref_width - layer_width) / DESIGN_GRID) * DESIGN_GRID
    else:
        raise ValueError(f"invalid anchor: {anchor}")
    return int(lx), int(ly)


def device_height_ratio(device_height: float, canvas_height: float) -> float:
    if canvas_height <= 0:
        raise ValueError("canvas_height must be positive")
    return device_height / canvas_height


def scaled_device_size(view_width: float, view_height: float, scale: float) -> tuple[int, int]:
    return round(view_width * scale), round(view_height * scale)


def distance_between_rects(
    ax: float,
    ay: float,
    aw: float,
    ah: float,
    bx: float,
    by: float,
    bw: float,
    bh: float,
) -> float:
    """Minimum gap between axis-aligned rectangles; 0 if overlapping."""
    if rects_overlap(ax, ay, aw, ah, bx, by, bw, bh):
        return 0.0
    dx = max(0.0, max(ax, bx) - min(ax + aw, bx + bw))
    dy = max(0.0, max(ay, by) - min(ay + ah, by + bh))
    if dx > 0 and dy > 0:
        return (dx**2 + dy**2) ** 0.5
    return dx + dy
