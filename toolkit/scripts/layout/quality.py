from __future__ import annotations


def preview_budget(render_count: int, max_renders: int = 4) -> dict[str, int | bool]:
    used = max(0, render_count)
    remaining = max(0, max_renders - used)
    return {
        "used": used,
        "remaining": remaining,
        "max": max_renders,
        "would_exceed": used >= max_renders,
    }
