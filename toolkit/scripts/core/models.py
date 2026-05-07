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
    """JSON shape for predict-checks CLI.

    For multi-panel strips, set ``screens`` and ``gap`` so text safe-zone is checked per panel
    (strip ``width`` must be the full artboard width). Set ``require_text_single_panel`` to
    enforce that all text layers map to the same strip column when ``screens`` > 1.
    """

    width: int = Field(gt=0)
    height: int = Field(gt=0)
    background: BackgroundModel
    layers: list[TextLayerModel | DeviceLayerModel] = Field(default_factory=list)
    screens: int = Field(default=1, ge=1, description="Panel count on the horizontal strip.")
    gap: int = Field(default=0, ge=0, description="Gap in px between panels.")
    require_text_single_panel: bool = Field(
        default=False,
        description="When True and screens>1, all text layers must map to the same strip column.",
    )
