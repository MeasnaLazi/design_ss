from __future__ import annotations

from unittest.mock import patch

import pytest

from designer.client import DesignerClientError, poll_agent_preview_data_until_changed


def _preview_data(revision: str) -> dict[str, object]:
    return {
        "version": 1,
        "revision": revision,
        "capturedAt": "2026-01-01T00:00:00.000Z",
        "gap": 40,
        "workspace_width": 1330,
        "workspace_height": 2796,
        "panels": [{"panel_index": 0, "panel_width": 1290, "panel_height": 2796, "panel_x": 0, "panel_y": 0, "layers": []}],
    }


def test_poll_accepts_first_snapshot_when_previous_revision_none() -> None:
    snap = _preview_data("rev-1")
    with patch(
        "designer.client.try_designer_pull_agent_preview_data",
        side_effect=[None, None, snap],
    ):
        out = poll_agent_preview_data_until_changed(
            "http://localhost:4713/__api/screenshot-designer",
            None,
            timeout=2.0,
        )
    assert out == snap


def test_poll_waits_until_revision_changes() -> None:
    a = _preview_data("rev-1")
    b = _preview_data("rev-2")
    with patch(
        "designer.client.try_designer_pull_agent_preview_data",
        side_effect=[a, a, a, b],
    ):
        out = poll_agent_preview_data_until_changed(
            "http://localhost:4713/__api/screenshot-designer",
            "rev-1",
            timeout=2.0,
        )
    assert out == b


def test_poll_timeout() -> None:
    snap = _preview_data("rev-1")
    with patch(
        "designer.client.try_designer_pull_agent_preview_data",
        return_value=snap,
    ):
        with pytest.raises(DesignerClientError, match="timed out"):
            poll_agent_preview_data_until_changed(
                "http://localhost:4713/__api/screenshot-designer",
                "rev-1",
                timeout=0.15,
                interval=0.02,
            )
