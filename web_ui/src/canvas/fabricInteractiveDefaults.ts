import { InteractiveFabricObject } from 'fabric'

/**
 * Global Fabric selection chrome — default 1px borders and small corners are hard to see
 * on the dark artboard and when the canvas is CSS-zoomed for preview.
 */
Object.assign(InteractiveFabricObject.ownDefaults, {
  borderScaleFactor: 2.5,
  /** Visual size of scale/rotate handles on the selection box */
  cornerSize: 28,
  /** Invisible hit target around each handle (pointer / touch) */
  touchCornerSize: 56,
  borderColor: 'rgba(244, 244, 245, 0.95)',
  cornerColor: 'rgba(244, 244, 245, 0.95)',
  cornerStrokeColor: 'rgba(24, 24, 27, 0.85)',
  transparentCorners: false,
  borderOpacityWhenMoving: 0.85,
})
