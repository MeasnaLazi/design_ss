from __future__ import annotations

import math
from typing import Literal

from core.constants import DESIGN_GRID

SnapMode = Literal["nearest", "floor", "ceil"]


def snap_to_grid(value: float, mode: SnapMode = "nearest", grid: int = DESIGN_GRID) -> int:
    if not math.isfinite(value):
        raise ValueError("value must be finite")
    g = float(grid)
    if mode == "nearest":
        return int(round(value / g) * g)
    if mode == "floor":
        return int(math.floor(value / g) * g)
    if mode == "ceil":
        return int(math.ceil(value / g) * g)
    raise ValueError(f"unknown mode: {mode}")


def is_grid_value(value: float, grid: int = DESIGN_GRID) -> bool:
    if not math.isfinite(value):
        return False
    return round(value) % grid == 0


def assert_grid_coords(x: float, y: float, grid: int = DESIGN_GRID) -> None:
    if not is_grid_value(x, grid) or not is_grid_value(y, grid):
        raise ValueError(f"x and y must be multiples of {grid}, got x={x}, y={y}")


def snap_point(x: float, y: float, mode: SnapMode = "nearest", grid: int = DESIGN_GRID) -> tuple[int, int]:
    return snap_to_grid(x, mode, grid), snap_to_grid(y, mode, grid)
