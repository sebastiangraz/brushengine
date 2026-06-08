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
uniform float uAspect;          // width / height
uniform float uWidthPx;         // stroke width in pixels (at depth w=1)
uniform float uViewportH;       // viewport height in px
uniform float uThicknessFalloff;// 0 = constant px width, 1 = perspective

varying vec2 vUv;

// Custom 2-point projection. Returns vec3(ndc.x, ndc.y, w).
// w is the homogeneous depth term: ~1 near the origin, grows with distance.
vec3 project(vec3 world) {
  float k = uPerspective;
  float hx = world.x * k * uVpX.x + world.z * k * uVpZ.x + uOrigin.x;
  float hy = world.x * k * uVpX.y + world.y * uVerticalScale + world.z * k * uVpZ.y + uOrigin.y;
  float hw = world.x * k + world.z * k + 1.0;
  vec2 ndc = vec2(hx, hy) / hw * uZoom;
  return vec3(ndc, hw);
}

void main() {
  vec3 c = project(aCenter);
  vec3 p = project(aPrev);
  vec3 n = project(aNext);

  // Work in aspect-corrected ("isotropic") screen space so the ribbon width is
  // uniform in pixels and the stroke is never stretched by the canvas aspect.
  vec2 cs = vec2(c.x * uAspect, c.y);
  vec2 ps = vec2(p.x * uAspect, p.y);
  vec2 ns = vec2(n.x * uAspect, n.y);

  vec2 dir = ns - ps;
  if (length(dir) < 1e-6) dir = cs - ps;        // endpoint fallbacks
  if (length(dir) < 1e-6) dir = ns - cs;
  if (length(dir) < 1e-6) dir = vec2(1.0, 0.0);
  dir = normalize(dir);
  vec2 normal = vec2(-dir.y, dir.x);            // screen-space perpendicular

  // Half width in NDC-y units (NDC spans 2 units over the viewport height).
  float halfWidth = uWidthPx / uViewportH;

  // Thickness vs distance: project() packs the homogeneous depth w in .z.
  // w==1 near origin -> factor 1; far -> 1/w (< 1).
  float depthScale = mix(1.0, clamp(1.0 / c.z, 0.0, 8.0), uThicknessFalloff);

  vec2 offset = normal * halfWidth * depthScale * aSide;
  vec2 finalNdc = c.xy + vec2(offset.x / uAspect, offset.y); // back to NDC

  vUv = aUv;
  gl_Position = vec4(finalNdc, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uBrush;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uBrush, vUv);
  // Brush textures carry the ink shape in their alpha channel.
  float a = tex.a * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
