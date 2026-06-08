export const vertexShader = /* glsl */ `
precision highp float;

// --- ribbon attributes ---
attribute vec3 aCenter;   // this centre-line point
attribute vec3 aPrev;     // previous centre-line point
attribute vec3 aNext;     // next centre-line point
attribute float aSide;    // -1 or +1 (which edge of the ribbon)
attribute vec2 aUv;       // u along length, v across width

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
uniform float uWidthPx;         // stroke width in CSS px (at depth w=1)
uniform float uThicknessFalloff;// 0 = constant px width, 1 = perspective

varying vec2 vUv;

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
  float halfWidth = uWidthPx / uMinDim;

  // Thickness vs distance: w==1 near origin -> factor 1; far -> 1/w (< 1).
  float depthScale = mix(1.0, clamp(1.0 / c.z, 0.0, 8.0), uThicknessFalloff);

  vec2 q = qc + normal * halfWidth * depthScale * aSide;

  vUv = aUv;
  gl_Position = vec4(q * uFit, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uBrush;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uInkBlend;   // 1 = CMYK multiply mode, 0 = normal alpha

varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uBrush, vUv);
  // Brush textures carry the ink shape in their alpha channel.
  float a = tex.a * uOpacity;
  if (a < 0.01) discard;

  if (uInkBlend > 0.5) {
    // Multiply blending against an opaque white canvas: output a per-channel
    // ink "transmission". No ink (a=0) -> white -> multiply is a no-op; full
    // ink -> uColor. Overlaps multiply together and darken, even same colours.
    gl_FragColor = vec4(mix(vec3(1.0), uColor, a), 1.0);
  } else {
    gl_FragColor = vec4(uColor, a);
  }
}
`;
