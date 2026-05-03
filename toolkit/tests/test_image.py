import base64
from io import BytesIO

from PIL import Image

from image import image_io


def _rgb_png_bytes() -> bytes:
    img = Image.new("RGB", (64, 48), color=(10, 20, 30))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_assert_png() -> None:
    data = _rgb_png_bytes()
    assert image_io.assert_png(data)


def test_load_image_from_base64() -> None:
    data = _rgb_png_bytes()
    b64 = base64.standard_b64encode(data).decode("ascii")
    img = image_io.load_image_from_base64(b64)
    assert img.width == 64 and img.height == 48


def test_load_image_from_data_url() -> None:
    data = _rgb_png_bytes()
    b64 = base64.standard_b64encode(data).decode("ascii")
    url = f"data:image/png;base64,{b64}"
    img = image_io.load_image_from_base64(url)
    assert img.width == 64


def test_match_preset_dimensions() -> None:
    m = image_io.match_preset_dimensions(1290, 2796, "iphone", None)
    assert m["matches"] is True
    m2 = image_io.match_preset_dimensions(100, 100, "iphone", None)
    assert m2["matches"] is False


def test_resize_max_edge() -> None:
    data = _rgb_png_bytes()
    img = Image.open(BytesIO(data)).convert("RGBA")
    out = image_io.resize_max_edge(img, 32)
    assert max(out.size) <= 32


def test_region_hex() -> None:
    data = _rgb_png_bytes()
    img = Image.open(BytesIO(data)).convert("RGBA")
    hx = image_io.region_hex(img, 0, 0, 64, 48)
    assert hx.startswith("#")


def test_dominant_colors_k() -> None:
    data = _rgb_png_bytes()
    img = Image.open(BytesIO(data)).convert("RGBA")
    cols = image_io.dominant_colors_k(img, 3)
    assert len(cols) >= 1
