from __future__ import annotations

import base64
import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from layout.presets import resolve_preset

_DATA_URL = re.compile(r"^data:image/[^;]+;base64,(.+)$", re.IGNORECASE)


@dataclass
class ImageInfo:
    width: int
    height: int
    mode: str
    has_alpha: bool
    format: str | None


def load_image(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def load_image_from_base64(b64: str) -> Image.Image:
    s = b64.strip()
    m = _DATA_URL.match(s)
    if m:
        s = m.group(1)
    raw = base64.b64decode(s, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def image_info(img: Image.Image) -> ImageInfo:
    return ImageInfo(
        width=img.width,
        height=img.height,
        mode=img.mode,
        has_alpha=img.mode in ("RGBA", "LA") or "transparency" in img.info,
        format=img.format,
    )


def match_preset_dimensions(
    width: int,
    height: int,
    canvas_size: str | None = None,
    preset_id: str | None = None,
) -> dict[str, Any]:
    p = resolve_preset(canvas_size, preset_id)
    matches = width == p.width and height == p.height
    return {
        "matches": matches,
        "expected": {"width": p.width, "height": p.height, "presetId": p.preset_id},
        "actual": {"width": width, "height": height},
    }


def region_mean_rgb(img: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[float, float, float]:
    crop = img.crop((left, top, right, bottom))
    if crop.width == 0 or crop.height == 0:
        return 0.0, 0.0, 0.0
    tiny = crop.resize((1, 1), Image.Resampling.LANCZOS)
    px = tiny.getpixel((0, 0))
    if isinstance(px, int):
        return float(px), float(px), float(px)
    r, g, b = px[0], px[1], px[2]
    return float(r), float(g), float(b)


def region_hex(img: Image.Image, left: int, top: int, right: int, bottom: int) -> str:
    r, g, b = region_mean_rgb(img, left, top, right, bottom)
    return f"#{int(round(r)):02x}{int(round(g)):02x}{int(round(b)):02x}"


def dominant_colors_k(img: Image.Image, k: int = 5) -> list[str]:
    """Heuristic palette via Pillow quantize (not a proof of contrast)."""
    n_colors = max(2, min(k, 32))
    small = img.convert("RGB").resize((120, 120), Image.Resampling.LANCZOS)
    q = small.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette() or []
    pairs = q.getcolors(120 * 120) or []
    pairs.sort(key=lambda x: -x[0])
    out: list[str] = []
    for _, idx in pairs[:k]:
        if idx * 3 + 2 < len(pal):
            r, g, b = pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2]
            out.append(f"#{r:02x}{g:02x}{b:02x}")
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG")


def save_jpeg(img: Image.Image, path: Path, quality: int = 90) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(path, format="JPEG", quality=quality)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def panel_edge_strip_boxes(width: int, height: int) -> list[tuple[int, int, int, int]]:
    """Four edge strips for panel-wide background sampling."""
    if width < 2 or height < 2:
        return [(0, 0, width, height)]
    strip = max(2, min(24, width // 24, height // 24))
    return [
        (0, 0, width, strip),
        (0, height - strip, width, height),
        (0, 0, strip, height),
        (width - strip, 0, width, height),
    ]


def panel_edge_hexes(img: Image.Image) -> list[str]:
    w, h = img.size
    out: list[str] = []
    for left, top, right, bottom in panel_edge_strip_boxes(w, h):
        if right <= left or bottom <= top:
            continue
        out.append(region_hex(img, left, top, right, bottom))
    return out


def bbox_halo_strip_boxes(
    width: int,
    height: int,
    left: float,
    top: float,
    right: float,
    bottom: float,
    pad: int,
) -> list[tuple[int, int, int, int]]:
    """Thin strips outside text AABB in panel coordinates."""
    li = int(max(0, min(width, round(left))))
    ti = int(max(0, min(height, round(top))))
    ri = int(max(0, min(width, round(right))))
    bi = int(max(0, min(height, round(bottom))))
    if ri <= li or bi <= ti:
        return []
    p = max(1, pad)
    boxes: list[tuple[int, int, int, int]] = []
    t0, t1 = max(0, ti - p), ti
    if t1 > t0:
        boxes.append((li, t0, ri, t1))
    b0, b1 = bi, min(height, bi + p)
    if b1 > b0:
        boxes.append((li, b0, ri, b1))
    l0, l1 = max(0, li - p), li
    if l1 > l0:
        boxes.append((l0, ti, l1, bi))
    r0, r1 = ri, min(width, ri + p)
    if r1 > r0:
        boxes.append((r0, ti, r1, bi))
    return boxes


def bbox_halo_hexes(
    img: Image.Image,
    left: float,
    top: float,
    right: float,
    bottom: float,
    pad: int,
) -> list[str]:
    w, h = img.size
    return [
        region_hex(img, *box)
        for box in bbox_halo_strip_boxes(w, h, left, top, right, bottom, pad)
    ]


def region_luminance_variance(img: Image.Image, left: int, top: int, right: int, bottom: int) -> float:
    """Variance of relative luminance in a region (flat band detection)."""
    crop = img.crop((left, top, right, bottom)).convert("RGB")
    if crop.width == 0 or crop.height == 0:
        return 0.0
    small = crop.resize((min(32, crop.width), min(32, crop.height)), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    if not pixels:
        return 0.0

    def lum(px: tuple[int, ...]) -> float:
        r, g, b = px[0], px[1], px[2]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    values = [lum(p) for p in pixels]
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def rgb_distance(a: str, b: str) -> float:
    """Simple RGB Euclidean distance between two #rrggbb colors."""

    def parse(h: str) -> tuple[float, float, float]:
        c = h.strip().lstrip("#")[:6]
        n = int(c, 16)
        return float((n >> 16) & 255), float((n >> 8) & 255), float(n & 255)

    ar, ag, ab = parse(a)
    br, bg, bb = parse(b)
    return ((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) ** 0.5
