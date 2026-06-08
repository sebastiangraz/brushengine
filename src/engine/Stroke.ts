import * as THREE from "three";
import type { Vec3 } from "./types";

/**
 * Build a ribbon BufferGeometry from a centre-line polyline.
 *
 * For each centre point we emit two vertices (side -1 / +1). The vertex shader
 * reads aPrev / aCenter / aNext to compute a screen-space tangent and pushes the
 * two vertices apart perpendicular to it — so the ribbon always faces the camera
 * (billboarding) and its width is controlled in screen space.
 */
export function buildStrokeGeometry(points: Vec3[]): THREE.BufferGeometry {
  const n = points.length;
  if (n < 2) {
    throw new Error("A stroke needs at least 2 points");
  }

  // Normalised cumulative chord length -> U coordinate along the stroke.
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    cum.push(cum[i - 1] + d);
  }
  const total = cum[n - 1] || 1;

  const center = new Float32Array(n * 2 * 3);
  const prev = new Float32Array(n * 2 * 3);
  const next = new Float32Array(n * 2 * 3);
  const side = new Float32Array(n * 2);
  const uv = new Float32Array(n * 2 * 2);

  const put3 = (arr: Float32Array, vi: number, p: Vec3) => {
    arr[vi * 3 + 0] = p[0];
    arr[vi * 3 + 1] = p[1];
    arr[vi * 3 + 2] = p[2];
  };

  for (let i = 0; i < n; i++) {
    const c = points[i];
    const p = points[Math.max(i - 1, 0)];
    const nx = points[Math.min(i + 1, n - 1)];
    const u = cum[i] / total;
    for (let s = 0; s < 2; s++) {
      const vi = i * 2 + s;
      put3(center, vi, c);
      put3(prev, vi, p);
      put3(next, vi, nx);
      side[vi] = s === 0 ? -1 : 1;
      uv[vi * 2 + 0] = u;
      uv[vi * 2 + 1] = s === 0 ? 0 : 1;
    }
  }

  // Two triangles per segment.
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    index.push(a, b, c, c, b, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("aCenter", new THREE.BufferAttribute(center, 3));
  geo.setAttribute("aPrev", new THREE.BufferAttribute(prev, 3));
  geo.setAttribute("aNext", new THREE.BufferAttribute(next, 3));
  geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geo.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}
