import {
  Control,
  InteractiveFabricObject,
  Textbox,
  type ControlRenderingStyleOverride,
} from 'fabric'

const MTR = 'mtr'

/**
 * Custom paint for the default rotation handle (`mtr`): curved arrow on a round cap
 * instead of the same square used for scale corners.
 */
/** Rotate handle (`mtr`) is drawn and hit-tested at 2× normal corner size. */
const ROTATE_HANDLE_SIZE_MULT = 2

function renderRotateHandleIcon(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  styleOverride: ControlRenderingStyleOverride | undefined,
  fabricObject: InteractiveFabricObject,
): void {
  ctx.save()
  const baseCorner =
    styleOverride?.cornerSize ?? fabricObject.cornerSize
  const mergedOverride: ControlRenderingStyleOverride = {
    ...styleOverride,
    cornerSize: baseCorner * ROTATE_HANDLE_SIZE_MULT,
  }
  const { stroke, xSize, ySize } = this.commonRenderProps(
    ctx,
    left,
    top,
    fabricObject,
    mergedOverride,
  )
  const R = Math.min(xSize, ySize) / 2

  ctx.beginPath()
  ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2)
  ctx.fill()
  if (stroke) {
    ctx.stroke()
  }

  const glyphStroke =
    styleOverride?.cornerStrokeColor ||
    fabricObject.cornerStrokeColor ||
    'rgba(24, 24, 27, 0.88)'
  ctx.strokeStyle = glyphStroke
  ctx.lineWidth = Math.max(1.75, R * 0.13)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const ar = R * 0.4
  const start = -0.55 * Math.PI
  const end = 0.9 * Math.PI

  ctx.beginPath()
  ctx.arc(0, 0, ar, start, end, false)
  ctx.stroke()

  const tipX = ar * Math.cos(end)
  const tipY = ar * Math.sin(end)
  const tx = -Math.sin(end)
  const ty = Math.cos(end)
  const wing = R * 0.22

  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - tx * wing + ty * wing * 0.55, tipY - ty * wing - tx * wing * 0.55)
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - tx * wing - ty * wing * 0.55, tipY - ty * wing + tx * wing * 0.55)
  ctx.stroke()

  ctx.restore()
}

function patchMtrControl(controls: Record<string, Control>): void {
  const mtr = controls[MTR]
  if (!mtr) return

  const origCalc = mtr.calcCornerCoords.bind(mtr)
  mtr.calcCornerCoords = function calcCornerCoordsDoubleRotate(
    angle,
    objectCornerSize,
    cx,
    cy,
    isTouch,
    fo,
  ) {
    return origCalc(
      angle,
      objectCornerSize * ROTATE_HANDLE_SIZE_MULT,
      cx,
      cy,
      isTouch,
      fo,
    )
  }

  mtr.render = renderRotateHandleIcon
}

let installed = false

function installFabricRotateControl(): void {
  if (installed) return
  installed = true

  const patchInteractive = InteractiveFabricObject.createControls.bind(
    InteractiveFabricObject,
  ) as () => { controls: Record<string, Control> }
  InteractiveFabricObject.createControls = function createControlsWithRotateGlyph() {
    const out = patchInteractive()
    patchMtrControl(out.controls)
    return out
  }

  const patchTextbox = Textbox.createControls.bind(Textbox) as () => {
    controls: Record<string, Control>
  }
  Textbox.createControls = function createControlsWithRotateGlyph() {
    const out = patchTextbox()
    patchMtrControl(out.controls)
    return out
  }
}

installFabricRotateControl()
