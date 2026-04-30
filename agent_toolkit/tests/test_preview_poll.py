from __future__ import annotations

from unittest.mock import patch

import pytest

from agent_toolkit.designer_client import DesignerClientError, poll_agent_preview_until_changed


def _minimal_png() -> bytes:
    """Tiny valid PNG (1x1) for magic-byte checks."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_poll_accepts_first_png_when_previous_none() -> None:
    png = _minimal_png()
    with patch(
        "agent_toolkit.designer_client.try_designer_pull_agent_preview",
        side_effect=[None, None, png],
    ):
        out = poll_agent_preview_until_changed("http://localhost:4713/__api/screenshot-designer", None, timeout=2.0)
    assert out == png


def test_poll_waits_until_bytes_change() -> None:
    a = _minimal_png()
    b = a[:-4] + b"\x00\x00\x00\x00"
    with patch(
        "agent_toolkit.designer_client.try_designer_pull_agent_preview",
        side_effect=[a, a, a, b],
    ):
        out = poll_agent_preview_until_changed(
            "http://localhost:4713/__api/screenshot-designer",
            a,
            timeout=2.0,
        )
    assert out == b


def test_poll_timeout() -> None:
    png = _minimal_png()
    with patch(
        "agent_toolkit.designer_client.try_designer_pull_agent_preview",
        return_value=png,
    ):
        with pytest.raises(DesignerClientError, match="timed out"):
            poll_agent_preview_until_changed(
                "http://localhost:4713/__api/screenshot-designer",
                png,
                timeout=0.15,
                interval=0.02,
            )
