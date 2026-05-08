from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GradientStopModel(BaseModel):
    offset: float = Field(ge=0, le=1)
    color: str


class GradientValueModel(BaseModel):
    angleDeg: float = 180
    stops: list[GradientStopModel] = Field(min_length=2)


class BackgroundModel(BaseModel):
    type: Literal["color", "gradient", "image"]
    value: str | GradientValueModel | Any = ""
