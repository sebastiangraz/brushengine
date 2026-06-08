import type { ProjectionParams, Vec3 } from "./types";

/**
 * CPU mirror of the GLSL projection (see shaders.ts). Kept in sync so we can:
 *   - draw vanishing-point guide lines / handles in the DOM overlay,
 *   - hit-test, and
 *   - sort strokes back-to-front by depth (w) for correct alpha blending.
 *
 * Returns homogeneous screen coords. Divide x,y by w for NDC, then * zoom.
 */
export interface Homog {
  x: number;
  y: number;
  w: number;
}

export function projectHomogeneous(p: Vec3, params: ProjectionParams): Homog {
  const [x, y, z] = p;
  const { vpX, vpZ, origin, perspective: k, verticalScale: vs } = params;
  return {
    x: x * k * vpX.x + z * k * vpZ.x + origin.x,
    y: x * k * vpX.y + y * vs + z * k * vpZ.y + origin.y,
    w: x * k + z * k + 1,
  };
}

/** Full projection to NDC (-1..1), including the post-projection 2D zoom. */
export function projectNDC(
  p: Vec3,
  params: ProjectionParams
): { x: number; y: number; w: number } {
  const h = projectHomogeneous(p, params);
  const inv = h.w !== 0 ? 1 / h.w : 0;
  return { x: h.x * inv * params.zoom, y: h.y * inv * params.zoom, w: h.w };
}

/** Average depth (homogeneous w) of a polyline — used for back-to-front sort. */
export function meanDepth(points: Vec3[], params: ProjectionParams): number {
  let sum = 0;
  for (const pt of points) sum += projectHomogeneous(pt, params).w;
  return sum / Math.max(points.length, 1);
}
