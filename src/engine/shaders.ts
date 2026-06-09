export const vertexShader = /* glsl */ `
precision highp float;

// --- ribbon attributes (per vertex; baked per-stroke at merge time) ---
attribute vec3 aCenter;   // this centre-line point
attribute vec3 aPrev;     // previous centre-line point
attribute vec3 aNext;     // next centre-line point
attribute float aSide;    // -1 or +1 (which edge of the ribbon)
attribute vec2 aUv;       // u along length, v across width
attribute vec3 aColor;    // stroke colour (straight sRGB)
attribute float aWidthPx; // stroke width in CSS px (at depth w=1)
attribute float aOpacity; // stroke opacity

// --- 2-point projection params ---
uniform vec2  uVpX;          // vanishing point of world +X (NDC)
uniform vec2  uVpZ;          // vanishing point of world +Z (NDC)
uniform vec2  uOrigin;       // screen position of world origin (NDC)
uniform float uPerspective;  // convergence strength (focal knob)
uniform float uVerticalScale;
uniform float uZoom;

// --- ribbon / viewport params ---
// The model is authored in a square frame (logical NDC, [-1,1] on both axes).
// uFit maps that square into the actual canvas clip space, preserving the
// model's aspect ratio (the square is centred; extra space becomes margin).
uniform vec2  uFit;             // (minDim/width, minDim/height)
uniform float uMinDim;          // min(width, height) in CSS px
uniform float uThicknessFalloff;// 0 = constant px width, 1 = perspective

varying vec2 vUv;
varying vec3 vColor;
varying float vOpacity;

// Custom 2-point projection. Returns vec3(q.x, q.y, w) where q is the position
// in the square authoring frame and w is the homogeneous depth term (~1 near the
// origin, growing with distance).
vec3 project(vec3 world) {
  float k = uPerspective;
  float hx = world.x * k * uVpX.x + world.z * k * uVpZ.x + uOrigin.x;
  float hy = world.x * k * uVpX.y + world.y * uVerticalScale + world.z * k * uVpZ.y + uOrigin.y;
  float hw = world.x * k + world.z * k + 1.0;
  vec2 q = vec2(hx, hy) / hw * uZoom;
  return vec3(q, hw);
}

void main() {
  vec3 c = project(aCenter);
  vec2 qc = c.xy;
  vec2 qp = project(aPrev).xy;
  vec2 qn = project(aNext).xy;

  // The square frame is isotropic in pixels, so tangent/normal are computed
  // directly in it — no aspect correction needed.
  vec2 dir = qn - qp;
  if (length(dir) < 1e-6) dir = qc - qp;        // endpoint fallbacks
  if (length(dir) < 1e-6) dir = qn - qc;
  if (length(dir) < 1e-6) dir = vec2(1.0, 0.0);
  dir = normalize(dir);
  vec2 normal = vec2(-dir.y, dir.x);

  // Half width in square-frame units: 2 units span minDim px, so px/minDim.
  float halfWidth = aWidthPx / uMinDim;

  // Thickness vs distance: w==1 near origin -> factor 1; far -> 1/w (< 1).
  float depthScale = mix(1.0, clamp(1.0 / c.z, 0.0, 8.0), uThicknessFalloff);

  vec2 q = qc + normal * halfWidth * depthScale * aSide;

  vUv = aUv;
  vColor = aColor;
  vOpacity = aOpacity;
  gl_Position = vec4(q * uFit, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uBrush;
uniform float uInkBlend;   // 1 = CMYK multiply mode, 0 = normal alpha

varying vec2 vUv;
varying vec3 vColor;
varying float vOpacity;

void main() {
  vec4 tex = texture2D(uBrush, vUv);
  // Brush textures carry the ink shape in their alpha channel.
  float a = tex.a * vOpacity;
  if (a < 0.01) discard;

  if (uInkBlend > 0.5) {
    // CMYK ink mix into the white-cleared OFFSCREEN target (not the canvas, so
    // the canvas's premultiplied-alpha mode doesn't apply here). The RGB blend
    // multiplies (dst * src), so the colour we emit IS the multiply factor: a
    // coverage-weighted mix(white, colour, a) — full ink darkens fully, faint/
    // edge pixels barely darken. Alpha carries straight coverage and accumulates
    // "over", so non-ink stays transparent (the page shows through).
    gl_FragColor = vec4(mix(vec3(1.0), vColor, a), a);
  } else {
    // Ordinary "over" straight to the canvas. The canvas is premultiplied-alpha,
    // so emit premultiplied colour (three's NormalBlending uses ONE for src).
    gl_FragColor = vec4(vColor * a, a);
  }
}
`;

// --- ink-mix composite pass -------------------------------------------------
// In ink mode the strokes are first drawn into an offscreen target cleared to
// white: RGB multiplies (giving the exact opaque-white result T) while alpha
// accumulates coverage. This pass converts (T, coverage) into a PREMULTIPLIED
// fragment for the premultiplied-alpha canvas: Cp = T - (1 - a). Composited over
// the (white) page that reproduces T at full strength, stays transparent where
// there's no ink, and is correct over any page colour. Crucially it only
// subtracts — no divide by alpha — so an 8-bit target is precise enough and we
// don't need a HalfFloat buffer (which Safari can't MSAA-resolve).
export const compositeVertexShader = /* glsl */ `
precision highp float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const compositeFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform float uInk;   // 1 = ink-mix target, 0 = plain "over" target (already premult)
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uTex, vUv);
  float a = t.a;
  // Both modes render into the MSAA offscreen target (the only AA path Safari
  // resolves reliably) and this pass blits it to the premultiplied canvas.
  //   ink:    t.rgb = T (ink over white). Premultiplied output Cp = T - (1 - a),
  //           which over a page of colour P gives T - (1-a)(1-P) — the ink-mix
  //           result, with no divide so it stays smooth at 8-bit.
  //   normal: t already holds premultiplied "over" colour; copy it straight.
  vec3 rgb = uInk > 0.5 ? (t.rgb - (1.0 - a)) : t.rgb;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), a);
}
`;
