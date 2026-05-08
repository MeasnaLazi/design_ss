import json
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from urllib.error import HTTPError

import designer.client as designer_client_mod
from designer.client import (
    DesignerClientError,
    ENV_DESIGNER_API_BASE,
    designer_enqueue_command,
    designer_session,
    resolve_designer_base_url,
    screenshot_designer_handoff,
    validate_designer_base_url,
    web_ui_url_from_designer_base,
)


def test_web_ui_url_from_designer_base() -> None:
    u = "http://localhost:4713/__api/screenshot-designer"
    assert web_ui_url_from_designer_base(u) == "http://localhost:4713"
    assert web_ui_url_from_designer_base("http://127.0.0.1:9999/__api/screenshot-designer") == (
        "http://127.0.0.1:9999"
    )


def test_screenshot_designer_handoff_skip_session(monkeypatch: pytest.MonkeyPatch) -> None:
    designer_client_mod.reset_publisher_dotenv_cache()
    monkeypatch.setenv(
        ENV_DESIGNER_API_BASE,
        "http://127.0.0.1:4713/__api/screenshot-designer",
    )
    try:
        out = screenshot_designer_handoff(skip_session=True)
    finally:
        designer_client_mod.reset_publisher_dotenv_cache()
    assert out["ok"] is True
    assert out["session"] is None
    h = out["handoff"]
    assert h["web_ui_url"] == "http://127.0.0.1:4713"
    assert h["designer_api_base"] == "http://127.0.0.1:4713/__api/screenshot-designer"
    assert h["web_ui_status"] == "unverified"


def test_screenshot_designer_handoff_with_session_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    designer_client_mod.reset_publisher_dotenv_cache()
    monkeypatch.setenv(
        ENV_DESIGNER_API_BASE,
        "http://127.0.0.1:4713/__api/screenshot-designer",
    )
    inner = MagicMock()
    inner.read.return_value = json.dumps(
        {"ok": True, "width": 1290, "height": 2796, "presetId": "appstore_iphone_portrait"},
    ).encode("utf-8")
    cm = MagicMock()
    cm.__enter__.return_value = inner
    cm.__exit__.return_value = None
    try:
        with patch("designer.client.urlopen", return_value=cm):
            out = screenshot_designer_handoff(timeout=5.0)
    finally:
        designer_client_mod.reset_publisher_dotenv_cache()
    assert out["ok"] is True
    assert out["handoff"]["web_ui_status"] == "ready"
    assert out["handoff"]["web_ui_url"] == "http://127.0.0.1:4713"
    assert out["session"]["presetId"] == "appstore_iphone_portrait"


def test_validate_designer_base_url_ok() -> None:
    u = "http://localhost:4713/__api/screenshot-designer"
    assert validate_designer_base_url(u) == u
    assert validate_designer_base_url(u + "/") == u


def test_validate_designer_base_url_rejects_remote_host() -> None:
    with pytest.raises(ValueError, match="host"):
        validate_designer_base_url("http://evil.example/__api/screenshot-designer")


def test_validate_designer_base_url_requires_path() -> None:
    with pytest.raises(ValueError, match="screenshot-designer"):
        validate_designer_base_url("http://localhost:4713/__api/other")


def test_designer_session_mocked() -> None:
    inner = MagicMock()
    inner.read.return_value = json.dumps(
        {"ok": True, "width": 100, "height": 200, "presetId": "p"},
    ).encode("utf-8")
    cm = MagicMock()
    cm.__enter__.return_value = inner
    cm.__exit__.return_value = None
    with patch("designer.client.urlopen", return_value=cm):
        out = designer_session("http://127.0.0.1:4713/__api/screenshot-designer")
    assert out["ok"] is True
    assert out["width"] == 100


def test_resolve_designer_base_url_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    designer_client_mod.reset_publisher_dotenv_cache()
    monkeypatch.setenv(
        ENV_DESIGNER_API_BASE,
        "http://127.0.0.1:4713/__api/screenshot-designer",
    )
    try:
        assert resolve_designer_base_url() == "http://127.0.0.1:4713/__api/screenshot-designer"
    finally:
        designer_client_mod.reset_publisher_dotenv_cache()


def test_resolve_designer_base_url_from_dotenv(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    (tmp_path / ".env").write_text(
        f"{ENV_DESIGNER_API_BASE}=http://127.0.0.1:9999/__api/screenshot-designer\n",
        encoding="utf-8",
    )
    designer_client_mod.reset_publisher_dotenv_cache()
    monkeypatch.delenv(ENV_DESIGNER_API_BASE, raising=False)
    monkeypatch.setattr("core.paths.toolkit_project_dir", lambda: tmp_path)
    out = resolve_designer_base_url()
    assert out == "http://127.0.0.1:9999/__api/screenshot-designer"


def test_designer_client_error_from_http() -> None:
    fp = BytesIO(json.dumps({"error": "bad op"}).encode())
    err = HTTPError(
        "http://localhost:4713/__api/screenshot-designer/enqueue-command",
        400,
        "Bad Request",
        None,
        fp,
    )

    with patch("designer.client.urlopen", side_effect=err):
        with pytest.raises(DesignerClientError) as ei:
            designer_enqueue_command("http://localhost:4713/__api/screenshot-designer", "noop", {})
    assert ei.value.status_code == 400
