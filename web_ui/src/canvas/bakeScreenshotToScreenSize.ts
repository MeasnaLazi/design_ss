import {
  DEVICE_FRAME_FRONT,
  getScreenshotBakeDimensions,
  type DeviceFrameMetrics,
  type ScreenQuad,
} from '../constants/deviceFrame'
import type { ScreenRegion } from './loadScreenRegion'

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error ?? new Error('read failed'))
    fr.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = dataUrl
  })
}

/**
 * Draw `source` with object-fit **cover** into a fixed bitmap, using high-quality smoothing.
 * Output is PNG (lossless) so UI text stays crisp after one resample.
 */
function renderCoverToPngDataUrl(
  source: CanvasImageSource,
  natW: number,
  natH: number,
  outW: number,
  outH: number,
  heightAdjustY: number,
): string {
  const canvas = document.createElement('canvas')
  const ADJUSTMENT_Y = heightAdjustY
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
  if (!ctx) {
    throw new Error('2D canvas context unavailable')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = Math.max(outW / natW, outH / natH)
  const dw = natW * scale
  const dh = (natH * scale) - ADJUSTMENT_Y
  const dx = (outW - dw) / 2
  const dy = ((outH - dh) / 2) + ADJUSTMENT_Y
  ctx.drawImage(source, dx, dy, dw, dh)

  return canvas.toDataURL('image/png')
}

/**
 * Resamples an uploaded screenshot to the ideal pixel size for the device style (e.g. 2241×4745 for front)
 * so on-canvas scaling matches the frame opening with minimal extra filtering.
 */
export async function bakeScreenshotFileForMetrics(
  file: File,
  metrics: DeviceFrameMetrics,
): Promise<string> {
  const { width: outW, height: outH } = getScreenshotBakeDimensions(metrics)

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        if (bitmap.width === outW && bitmap.height === outH) {
          return readFileDataUrl(file)
        }
        return renderCoverToPngDataUrl(
          bitmap,
          bitmap.width,
          bitmap.height,
          outW,
          outH,
          heightAdjustForMetrics(metrics),
        )
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall through to Image() path (e.g. unsupported type)
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  const natW = img.naturalWidth || 1
  const natH = img.naturalHeight || 1
  if (natW === outW && natH === outH) {
    return dataUrl
  }
  return renderCoverToPngDataUrl(img, natW, natH, outW, outH, heightAdjustForMetrics(metrics))
}

function heightAdjustForMetrics(m: DeviceFrameMetrics): number {
  return m.viewW === DEVICE_FRAME_FRONT.viewW && m.viewH === DEVICE_FRAME_FRONT.viewH ? 36 : 20
}

// ── Perspective warp helpers ───────────────────────────────────────────────

/**
 * Computes the 3×3 homography matrix (row-major) that maps the unit square
 * (0,0)→(1,0)→(1,1)→(0,1) to the given destination 4 points.
 *
 * Direct closed-form solution — no linear algebra library required.
 */
function homographyFromUnitSquare(
  p00: readonly [number, number], // src (0,0) → dest
  p10: readonly [number, number], // src (1,0) → dest
  p11: readonly [number, number], // src (1,1) → dest
  p01: readonly [number, number], // src (0,1) → dest
): number[] {
  const [x0, y0] = p00
  const [x1, y1] = p10
  const [x2, y2] = p11
  const [x3, y3] = p01

  const dx1 = x1 - x2, dx2 = x3 - x2
  const dy1 = y1 - y2, dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3

  const denom = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / denom
  const h = (dx1 * sy - sx * dy1) / denom

  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const c = x0
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  const f = y0

  return [a, b, c, d, e, f, g, h, 1]
}

/**
 * Inverts a 3×3 matrix stored in row-major order.
 * Returns null for singular matrices.
 */
function invertMat3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
    (e * i - f * h) * inv, -(b * i - c * h) * inv,  (b * f - c * e) * inv,
    -(d * i - f * g) * inv,  (a * i - c * g) * inv, -(a * f - c * d) * inv,
     (d * h - e * g) * inv, -(a * h - b * g) * inv,  (a * e - b * d) * inv,
  ]
}

/**
 * Perspective-correct warp via WebGL homography.
 *
 * Maps source image exactly onto the 4 quad corners: TL→TR→BR→BL.
 * Every output pixel is computed by inverse-mapping through H⁻¹ so even
 * trapezoidal (non-parallelogram) quads render without distortion.
 *
 * Returns null if WebGL is unavailable; caller must fall back.
 */
function webglPerspectiveWarp(
  source: CanvasImageSource,
  outW: number,
  outH: number,
  quad: ScreenQuad,
): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const gl = (
    canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
  ) as WebGLRenderingContext | null
  if (!gl) return null

  // Vertex shader — full-screen quad, passes fragment position via gl_FragCoord
  const vsSource = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `
  // Fragment shader — inverse-homography lookup
  // H maps unit-square (u,v) → viewBox (x,y).  H⁻¹ maps viewBox → unit-square.
  // gl_FragCoord is in pixel coords with Y=0 at bottom; flip Y to match SVG space (Y=0 at top).
  // WebGL textures have (0,0) at bottom-left so we also flip v when sampling.
  const fsSource = `
    precision highp float;
    uniform sampler2D u_src;
    uniform mat3 u_Hinv;
    uniform float u_viewH;
    void main() {
      float fx = gl_FragCoord.x;
      float fy = u_viewH - gl_FragCoord.y;   // flip Y: SVG/image coords
      vec3 p = u_Hinv * vec3(fx, fy, 1.0);
      float u = p.x / p.z;
      float v = p.y / p.z;
      // No hard clip — CLAMP_TO_EDGE stretches edge pixels outward so the SVG
      // mask (applied in applyScreenshotToDeviceGroup) can clip precisely.
      gl_FragColor = texture2D(u_src, vec2(u, v));
    }
  `

  function compileShader(type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[webglPerspectiveWarp] shader error:', gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    return s
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource)
  if (!vs || !fs) return null

  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[webglPerspectiveWarp] link error:', gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)

  // Full-screen triangle pair in clip space
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
    gl.STATIC_DRAW,
  )
  const aPosLoc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(aPosLoc)
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

  // Upload source as texture
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
  } catch (e) {
    console.error('[webglPerspectiveWarp] texImage2D failed:', e)
    return null
  }
  gl.uniform1i(gl.getUniformLocation(prog, 'u_src'), 0)

  // Compute homography: unit square → quad corners (in viewBox / SVG coords)
  // (0,0)→TL, (1,0)→TR, (1,1)→BR, (0,1)→BL
  const H = homographyFromUnitSquare(quad.tl, quad.tr, quad.br, quad.bl)
  const Hinv = invertMat3(H)
  if (!Hinv) {
    console.error('[webglPerspectiveWarp] degenerate homography')
    return null
  }

  // WebGL mat3 uniform is column-major
  const HinvCM = new Float32Array([
    Hinv[0], Hinv[3], Hinv[6],
    Hinv[1], Hinv[4], Hinv[7],
    Hinv[2], Hinv[5], Hinv[8],
  ])
  gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'u_Hinv'), false, HinvCM)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_viewH'), outH)

  gl.viewport(0, 0, outW, outH)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  return canvas.toDataURL('image/png')
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Warps a screenshot into the quadrilateral defined by {@link ScreenQuad} using a
 * WebGL perspective/homography transform, producing a PNG the same size as the SVG
 * viewBox (quad.viewW × quad.viewH).
 *
 * Unlike the old affine approach (which only mapped 3 corners correctly), the
 * homography maps all 4 corners exactly — including trapezoidal screen faces.
 *
 * Falls back to the affine Canvas 2D warp if WebGL is unavailable.
 */
export async function bakeScreenshotToQuad(file: File, quad: ScreenQuad): Promise<string> {
  const outW = quad.viewW
  const outH = quad.viewH

  async function warpWebGL(source: CanvasImageSource): Promise<string | null> {
    return webglPerspectiveWarp(source, outW, outH, quad)
  }

  // Affine fallback (parallelogram approximation — used only if WebGL is absent)
  async function warpAffine(source: CanvasImageSource, natW: number, natH: number): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const [tlx, tly] = quad.tl
    const [trx, try_] = quad.tr
    const [blx, bly] = quad.bl

    const a = (trx - tlx) / natW
    const b = (try_ - tly) / natW
    const c = (blx - tlx) / natH
    const d = (bly - tly) / natH

    ctx.setTransform(a, b, c, d, tlx, tly)
    ctx.drawImage(source, 0, 0, natW, natH)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return canvas.toDataURL('image/png')
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        const result = await warpWebGL(bitmap)
        if (result) return result
        return await warpAffine(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // fall through to Image() path
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  const result = await warpWebGL(img)
  if (result) return result
  return warpAffine(img, img.naturalWidth || 1, img.naturalHeight || 1)
}

/**
 * Bakes a screenshot into a canvas the same size as the SVG viewBox (region.viewW × region.viewH).
 *
 * The screenshot is cover-scaled to fill the screen opening (the axis-aligned bounding box of the
 * `#screen` path) and drawn at its position within the viewBox. Pixels outside the screen area are
 * transparent — the `#screen` clip path in Fabric will reveal exactly the right region.
 *
 * Used for rectangular/front-facing frames where the screen is axis-aligned.
 */
export async function bakeScreenshotForRegion(file: File, region: ScreenRegion): Promise<string> {
  const { tl, tr, bl, viewW, viewH } = region
  const screenX = tl[0]
  const screenY = tl[1]
  const screenW = tr[0] - tl[0]
  const screenH = bl[1] - tl[1]

  async function draw(source: CanvasImageSource, natW: number, natH: number): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = viewW
    canvas.height = viewH
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Cover-scale: fill the screen area without distortion, centred on it
    const scale = Math.max(screenW / natW, screenH / natH)
    const dw = natW * scale
    const dh = natH * scale
    const dx = screenX + (screenW - dw) / 2
    const dy = screenY + (screenH - dh) / 2
    ctx.drawImage(source, dx, dy, dw, dh)
    return canvas.toDataURL('image/png')
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        return await draw(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // fall through to Image() path
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  return draw(img, img.naturalWidth || 1, img.naturalHeight || 1)
}
