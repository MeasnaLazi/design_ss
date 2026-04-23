from __future__ import annotations

from typing import Annotated, Any, Literal

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


class TextLayerModel(BaseModel):
    kind: Literal["text"] = "text"
    id: str
    x: float
    y: float
    width: float
    height: float
    content: str = ""
    size: float = 0
    color: str = "#000000"


class DeviceLayerModel(BaseModel):
    kind: Literal["device_frame"] = "device_frame"
    id: str
    x: float
    y: float
    width: float
    height: float


LayerInput = Annotated[TextLayerModel | DeviceLayerModel, Field(discriminator="kind")]


class SessionCheckInput(BaseModel):
    """JSON shape for predict-checks CLI."""

    width: int = Field(gt=0)
    height: int = Field(gt=0)
    background: BackgroundModel
    layers: list[TextLayerModel | DeviceLayerModel] = Field(default_factory=list)
