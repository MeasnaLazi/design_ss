/**
 * webgl-renderer.js — Steps 5 + 6: WebGL2 perspective warp + stencil clip.
 *
 * Renders a texture onto a full-screen quad using a homography matrix,
 * clipped to a polygon via the WebGL stencil buffer.
 */

// ---------------------------------------------------------------------------
// Shader sources
// ---------------------------------------------------------------------------

const VERT_SRC = /* glsl */`#version 300 es
precision highp float;

// Full-screen quad vertex: clip-space position (-1..1)
in vec2 aPos;

// Inverse homography matrix (maps canvas UV [0..1] → image UV [0..1])
// Passed as column-major mat3
uniform mat3 uHinv;

out vec2 vUV;

void main() {
  // Map clip-space (-1..1) → canvas UV (0..1)
  vec2 canvasUV = aPos * 0.5 + 0.5;

  // Apply inverse homography projectively
  vec3 q = uHinv * vec3(canvasUV, 1.0);
  vUV = q.xy / q.z;

  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec4 uCrop;  // (u0, v0, u1, v1)

in vec2 vUV;
out vec4 fragColor;

void main() {
  // Remap vUV [0..1] into crop region
  vec2 uv = uCrop.xy + vUV * (uCrop.zw - uCrop.xy);

  // Discard outside [0,1] to avoid wrap/mirror artifacts
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    discard;
  }

  fragColor = texture(uTex, uv);
}
`;

// Stencil polygon shaders (just write to stencil buffer; no color output needed)
const STENCIL_VERT_SRC = /* glsl */`#version 300 es
precision highp float;
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;
const STENCIL_FRAG_SRC = /* glsl */`#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`;

// ---------------------------------------------------------------------------
// WebGLRenderer class
// ---------------------------------------------------------------------------

export class WebGLRenderer {
  /**
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._gl = null;
    this._warpProgram = null;
    this._stencilProgram = null;
    this._quadVAO = null;
    this._quadVBO = null;
    this._texture = null;
    this._lastImageSrc = null; // cache key to avoid re-uploads
    this._init();
  }

  _init() {
    const gl = this._canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('[webgl-renderer] WebGL2 not available in this browser.');
    this._gl = gl;

    // Warp program
    this._warpProgram = createProgram(gl, VERT_SRC, FRAG_SRC);

    // Stencil program
    this._stencilProgram = createProgram(gl, STENCIL_VERT_SRC, STENCIL_FRAG_SRC);

    // Full-screen quad geometry (-1..1)
    const quadVerts = new Float32Array([
      -1, -1,  1, -1,  1, 1,
      -1, -1,  1,  1, -1, 1,
    ]);
    this._quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Empty texture slot
    this._texture = gl.createTexture();
  }

  /**
   * Render the warped screenshot clipped to the screen quad.
   *
   * @param {HTMLImageElement|ImageBitmap} image   – source screenshot
   * @param {Float32Array}                H        – 9-element col-major 3×3 homography
   * @param {{ u0,v0,u1,v1 }}             crop     – UV crop rectangle
   * @param {Array<[number,number]>}      quad     – [TL,TR,BR,BL] in SVG space
   * @param {{ x,y,width,height }}        viewBox  – SVG viewBox
   * @param {number}                      dpr      – device pixel ratio
   */
  render(image, H, crop, quad, viewBox, dpr = 1) {
    const gl = this._gl;
    const w = this._canvas.width;
    const h = this._canvas.height;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    // Upload texture only when image changes
    this._uploadTexture(image);

    // Compute H⁻¹ for the vertex shader (maps canvas UV → image UV)
    // We also need to account for the viewBox → canvas pixel mapping
    const Hinv = this._buildHinv(H, quad, viewBox, w, h);

    // -------------------------------------------------------------------
    // Pass 1: Write screen quad into stencil buffer
    // -------------------------------------------------------------------
    const quadClip = this._quadToClip(quad, viewBox, w, h);
    this._renderStencil(quadClip);

    // -------------------------------------------------------------------
    // Pass 2: Render warped image masked by stencil
    // -------------------------------------------------------------------
    gl.useProgram(this._warpProgram);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.colorMask(true, true, true, true);

    // Bind full-screen quad
    const posLoc = gl.getAttribLocation(this._warpProgram, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVBO);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    gl.uniformMatrix3fv(gl.getUniformLocation(this._warpProgram, 'uHinv'), false, Hinv);
    gl.uniform4f(
      gl.getUniformLocation(this._warpProgram, 'uCrop'),
      crop.u0, crop.v0, crop.u1, crop.v1
    );
    gl.uniform1i(gl.getUniformLocation(this._warpProgram, 'uTex'), 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.STENCIL_TEST);
  }

  /**
   * Write the screen quad polygon into the stencil buffer (value = 1).
   * Uses a triangle fan from the quad's centroid.
   *
   * @param {Array<[number,number]>} quadClip – corners in clip space
   */
  _renderStencil(quadClip) {
    const gl = this._gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);

    // Triangulate quad as 2 triangles: TL,TR,BR and TL,BR,BL
    const [tl, tr, br, bl] = quadClip;
    const verts = new Float32Array([
      ...tl, ...tr, ...br,
      ...tl, ...br, ...bl,
    ]);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);

    const posLoc = gl.getAttribLocation(this._stencilProgram, 'aPos');
    gl.useProgram(this._stencilProgram);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.deleteBuffer(buf);
  }

  /**
   * Upload texture if image src has changed (avoids redundant uploads).
   *
   * @param {HTMLImageElement|ImageBitmap} image
   */
  _uploadTexture(image) {
    const key = image.src ?? 'bitmap';
    if (key === this._lastImageSrc) return;
    this._lastImageSrc = key;

    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * Build H⁻¹ that maps canvas UV (0..1) → image UV (0..1).
   *
   * The homography H maps image UV → SVG space.
   * We need: canvas pixel → SVG space → image UV.
   *
   * T_canvas maps canvas UV → SVG space (translate + scale by viewBox).
   * H maps SVG quad corners → image corners.
   * We want: image_UV = H⁻¹ · T_canvas · canvas_UV
   * So:  H_inv_full = H⁻¹ · T_canvas
   *
   * @param {Float32Array} H     – col-major 3×3 forward homography
   * @param {Array}        quad  – in SVG space
   * @param {object}       viewBox
   * @param {number}       w
   * @param {number}       h
   * @returns {Float32Array} col-major 3×3
   */
  _buildHinv(H, quad, viewBox, w, h) {
    // Convert col-major → row-major 3×3
    const Hrm = colMajorToRowMajor(H);

    // T_canvas: maps canvas UV (0..1) → SVG space.
    // In the vertex shader: canvasUV.y = aPos.y * 0.5 + 0.5
    // WebGL clip Y=+1 (top) → canvasUV.y = 1.0
    // SVG Y=0 is top, so we must FLIP V: SVG_y = viewBox.y + viewBox.height * (1 - v)
    //   = viewBox.y + viewBox.height - viewBox.height * v
    // Row 1 of T_canvas (for Y): scale = -viewBox.height, offset = viewBox.y + viewBox.height
    const Tc = [
      [viewBox.width,   0,              viewBox.x                       ],
      [0,              -viewBox.height, viewBox.y + viewBox.height       ],
      [0,               0,             1                                 ],
    ];

    // Invert H (row-major)
    const Hinv = invertMat3(Hrm);

    // Compose: (H⁻¹ · T_canvas)
    const result = mat3Mul(Hinv, Tc);

    // Return col-major
    return rowMajorToColMajor(result);
  }

  /**
   * Convert quad corners from SVG space → WebGL clip space (-1..1).
   *
   * @param {Array<[number,number]>} quad
   * @param {{ x,y,width,height }} viewBox
   * @param {number} w – canvas pixel width
   * @param {number} h – canvas pixel height
   * @returns {Array<[number,number]>}
   */
  _quadToClip(quad, viewBox, w, h) {
    return quad.map(([sx, sy]) => {
      // SVG → canvas UV (0..1)
      const u = (sx - viewBox.x) / viewBox.width;
      const v = (sy - viewBox.y) / viewBox.height;
      // Canvas UV → clip (-1..1), flip Y
      return [u * 2 - 1, 1 - v * 2];
    });
  }

  destroy() {
    const gl = this._gl;
    if (!gl) return;
    gl.deleteTexture(this._texture);
    gl.deleteBuffer(this._quadVBO);
    gl.deleteProgram(this._warpProgram);
    gl.deleteProgram(this._stencilProgram);
  }
}

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[webgl-renderer] Shader compile error:\n${info}`);
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`[webgl-renderer] Program link error:\n${info}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return prog;
}

// ---------------------------------------------------------------------------
// Matrix helpers for H⁻¹ construction (row-major)
// ---------------------------------------------------------------------------

function mat3Mul(A, B) {
  const C = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

function invertMat3(M) {
  const [[a,b,c],[d,e,f],[g,h,i_]] = M;
  const det = a*(e*i_-f*h) - b*(d*i_-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-10) throw new Error('[webgl-renderer] Homography is not invertible.');
  const inv = 1 / det;
  return [
    [(e*i_-f*h)*inv, (c*h-b*i_)*inv, (b*f-c*e)*inv],
    [(f*g-d*i_)*inv, (a*i_-c*g)*inv, (c*d-a*f)*inv],
    [(d*h-e*g)*inv,  (b*g-a*h)*inv,  (a*e-b*d)*inv],
  ];
}

/** Column-major Float32Array → row-major array of arrays */
function colMajorToRowMajor(cm) {
  return [
    [cm[0], cm[3], cm[6]],
    [cm[1], cm[4], cm[7]],
    [cm[2], cm[5], cm[8]],
  ];
}

/** Row-major array of arrays → column-major Float32Array */
function rowMajorToColMajor(rm) {
  return new Float32Array([
    rm[0][0], rm[1][0], rm[2][0],
    rm[0][1], rm[1][1], rm[2][1],
    rm[0][2], rm[1][2], rm[2][2],
  ]);
}
