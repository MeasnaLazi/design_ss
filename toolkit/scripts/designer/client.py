"""HTTP client for the Vite screenshot-designer API (same contract as web_ui vite-plugin)."""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv

from core import paths as _paths

# Env var name (matches handoff field concept: designer_api_base).
ENV_DESIGNER_API_BASE = "DESIGNER_API_BASE"

DEFAULT_DESIGNER_BASE = "http://localhost:4713/__api/screenshot-designer"

_DOTENV_LOADED = False


def ensure_publisher_dotenv_loaded() -> None:
    """Load `toolkit/.env` once (does not override existing os.environ)."""
    global _DOTENV_LOADED
    if _DOTENV_LOADED:
        return
    env_path = _paths.toolkit_project_dir() / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=False)
    _DOTENV_LOADED = True


def reset_publisher_dotenv_cache() -> None:
    """Reset internal dotenv load flag (for tests)."""
    global _DOTENV_LOADED
    _DOTENV_LOADED = False


def resolve_designer_base_url(override: str | None = None) -> str:
    """
    Resolve designer API base URL: optional override, then DESIGNER_API_BASE (already set), then load `toolkit/.env` and read DESIGNER_API_BASE, then default.
    Call ensure_publisher_dotenv_loaded() before this (CLI main does).
    """
    if override is not None and str(override).strip():
        return validate_designer_base_url(str(override).strip())
    ensure_publisher_dotenv_loaded()
    v = os.environ.get(ENV_DESIGNER_API_BASE, "").strip()
    if v:
        return validate_designer_base_url(v)
    return validate_designer_base_url(DEFAULT_DESIGNER_BASE)


class DesignerClientError(Exception):
    """Raised when the server returns an error or the request fails."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        body: str | None = None,
        url: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body
        self.url = url

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": str(self),
            "statusCode": self.status_code,
            "body": self.body,
            "url": self.url,
        }


def web_ui_url_from_designer_base(designer_base_url: str) -> str:
    """
    Derive the Vite dev server origin (web UI) from the screenshot-designer API base URL.
    Example: http://localhost:4713/__api/screenshot-designer -> http://localhost:4713
    """
    base = validate_designer_base_url(designer_base_url)
    parsed = urlparse(base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("designer base URL must include scheme and host")
    return f"{parsed.scheme}://{parsed.netloc}"


def screenshot_designer_handoff(
    *,
    designer_base_override: str | None = None,
    timeout: float = 15.0,
    skip_session: bool = False,
) -> dict[str, Any]:
    """
    Build the orchestrator handoff object and optionally verify the live session API.

    **screenshot_background** and **screenshot_panel** consume this payload after **toolkit_runner** has started
    the Web UI; **screenshot_requirements** uses layout CLI only and does not call this function. The
    ``screenshot_designer_handoff`` name matches the screenshot-designer API, not a single monolithic agent file.

    Returns a dict: ``{"ok": True, "handoff": {...}, "session": ...}``.
    ``handoff.web_ui_status`` is ``ready`` after a successful session probe, or
    ``unverified`` when ``skip_session`` is True (URLs only; caller assumes server is up).

    ``toolkit_runner`` may instead emit ``already_running`` or ``started``; consumers
    should treat ``ready``, ``started``, and ``already_running`` as Web UI available.
    """
    api_base = resolve_designer_base_url(designer_base_override)
    web = web_ui_url_from_designer_base(api_base)
    if skip_session:
        return {
            "ok": True,
            "handoff": {
                "web_ui_url": web,
                "designer_api_base": api_base,
                "web_ui_status": "unverified",
            },
            "session": None,
        }
    sess = designer_session(api_base, timeout=timeout)
    if not sess.get("ok"):
        raise DesignerClientError(
            "session probe did not return ok",
            body=json.dumps(sess),
            url=f"{api_base}/session",
        )
    return {
        "ok": True,
        "handoff": {
            "web_ui_url": web,
            "designer_api_base": api_base,
            "web_ui_status": "ready",
        },
        "session": sess,
    }


def validate_designer_base_url(base_url: str) -> str:
    """
    Require http(s) and loopback host only (reduces accidental SSRF from agent prompts).
    """
    raw = base_url.strip().rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("designer base URL must use http or https")
    host = (parsed.hostname or "").lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError(
            "designer base URL host must be localhost, 127.0.0.1, or ::1 (got {!r})".format(host),
        )
    if "screenshot-designer" not in (parsed.path or ""):
        raise ValueError("designer base URL path must include screenshot-designer (e.g. .../__api/screenshot-designer)")
    return raw


def _json_request(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        data = payload
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if not raw.strip():
                return {}
            out = json.loads(raw)
            if not isinstance(out, dict):
                raise DesignerClientError("response JSON must be an object", url=url)
            return out
    except HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            parsed = json.loads(err_body) if err_body.strip() else {}
            msg = str(parsed.get("error", e.reason))
        except json.JSONDecodeError:
            msg = err_body or str(e.reason)
        raise DesignerClientError(
            msg,
            status_code=e.code,
            body=err_body,
            url=url,
        ) from e
    except URLError as e:
        raise DesignerClientError(str(e.reason or e), url=url) from e


def designer_session(
    base_url: str,
    *,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """GET ``{base}/session`` with no query string (server resolves preset from app state / defaults)."""
    base = validate_designer_base_url(base_url)
    url = f"{base}/session"
    return _json_request("GET", url, timeout=timeout)


def designer_enqueue_command(
    base_url: str,
    operation: str,
    args: dict[str, Any] | None = None,
    *,
    request_id: str | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    """POST ``{base}/enqueue-command`` — delivers to the browser via SSE (client-authoritative ops)."""
    base = validate_designer_base_url(base_url)
    url = f"{base}/enqueue-command"
    body: dict[str, Any] = {"operation": operation, "args": args or {}}
    if request_id is not None:
        body["requestId"] = request_id
    return _json_request("POST", url, body=body, timeout=timeout)


def try_designer_pull_agent_preview(
    base_url: str,
    *,
    timeout: float = 60.0,
) -> bytes | None:
    """
    GET ``{base}/agent-preview`` — returns PNG bytes, or ``None`` if the server responds 404
    (``no_preview_yet``).
    """
    base = validate_designer_base_url(base_url)
    url = f"{base}/agent-preview"
    req = Request(url, headers={"Accept": "image/png,*/*"}, method="GET")
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except HTTPError as e:
        if e.code == 404:
            if e.fp:
                e.read()
            return None
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        raise DesignerClientError(
            str(e.reason or e),
            status_code=e.code,
            body=err_body,
            url=url,
        ) from e
    except URLError as e:
        raise DesignerClientError(str(e.reason or e), url=url) from e


def designer_pull_agent_preview(
    base_url: str,
    *,
    timeout: float = 60.0,
) -> bytes:
    """GET ``{base}/agent-preview`` — last PNG pushed from the browser (404 if none)."""
    data = try_designer_pull_agent_preview(base_url, timeout=timeout)
    if data is None:
        base = validate_designer_base_url(base_url)
        url = f"{base}/agent-preview"
        raise DesignerClientError(
            "no_preview_yet",
            status_code=404,
            body="",
            url=url,
        )
    return data


def poll_agent_preview_until_changed(
    base_url: str,
    previous: bytes | None,
    *,
    timeout: float,
    interval: float = 0.08,
) -> bytes:
    """
    Poll ``agent-preview`` until a valid PNG appears that differs from ``previous``.

    ``previous`` is ``None`` when there was no prior preview (e.g. first 404): the first
    valid PNG returned after enqueue is accepted. Used after ``render_panel_preview`` so
    the CLI can wait for the browser to POST the new crop.
    """
    base = validate_designer_base_url(base_url)
    url = f"{base}/agent-preview"
    deadline = time.monotonic() + max(timeout, 0.1)
    while time.monotonic() < deadline:
        data = try_designer_pull_agent_preview(base_url, timeout=min(10.0, timeout))
        if data is not None and len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
            if previous is None or data != previous:
                return data
        time.sleep(max(interval, 0.01))
    raise DesignerClientError(
        "timed out waiting for agent preview to update after enqueue",
        status_code=None,
        body=None,
        url=url,
    )

