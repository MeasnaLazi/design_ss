"""Parse and validate ``--panels`` arguments for multi-panel preview commands."""

from __future__ import annotations

import re


def parse_panel_indexes_arg(raw: str) -> list[int]:
    """
    Parse comma-separated 0-based panel indexes, e.g. ``"0, 2"`` -> ``[0, 2]``.
    Raises ValueError on empty or invalid tokens.
    """
    s = raw.strip()
    if not s:
        raise ValueError("panels list is empty")
    parts = [p.strip() for p in s.split(",")]
    out: list[int] = []
    for p in parts:
        if not p:
            raise ValueError("panels list has an empty segment")
        if not re.fullmatch(r"-?\d+", p):
            raise ValueError(f"invalid panel index token: {p!r}")
        out.append(int(p))
    return out


def dedupe_preserve_order(values: list[int]) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for v in values:
        if v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def sorted_contiguous_panel_indexes(indexes: list[int]) -> list[int]:
    """
    Return unique panel indexes sorted ascending, or raise if they are not a
    contiguous strip segment (e.g. ``[0, 1]``, ``[3, 4]``, ``[2, 3, 4]``).
    """
    if not indexes:
        raise ValueError("panels list is empty")
    uniq = sorted(set(indexes))
    for i in range(len(uniq)):
        if uniq[i] != uniq[0] + i:
            raise ValueError(
                "panel indexes must be adjacent columns on the strip (e.g. 0,1 or 3,4 or 2,3,4); "
                f"after sorting deduplicated values: {uniq}",
            )
    return uniq
