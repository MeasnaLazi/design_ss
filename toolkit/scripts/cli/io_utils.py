"""Shared JSON / stdin helpers for CLI command handlers (avoids circular imports)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def json_print(obj: object, compact: bool) -> None:
    if compact:
        print(json.dumps(obj, separators=(",", ":"), default=str))
    else:
        print(json.dumps(obj, indent=2, default=str))


def read_json_arg(path: str) -> dict:
    raw = Path(path).read_text(encoding="utf-8") if path != "-" else sys.stdin.read()
    return json.loads(raw)


def parse_args_json_payload(s: str) -> dict:
    t = s.strip()
    if t.startswith("@"):
        return json.loads(Path(t[1:]).read_text(encoding="utf-8"))
    return json.loads(t)
