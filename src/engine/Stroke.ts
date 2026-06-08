import * as THREE from "three";
import type { Vec3 } from "./types";

export interface BatchItem {
  points: Vec3[];
  /** straight sRGB colour 0..1 */
  color: [number, number, number];
  widthPx: number;
  opacity: number;
}

/**
 * Build ONE ribbon BufferGeometry from many strokes, baking per-stroke colour,
 * width and opacity into vertex attributes. This lets the whole scene render in a
 * handful of draw calls instead of one per stroke.
 *
 * Each centre point emits two vertices (side -1 / +1); the vertex shader reads
 * aPrev / aCenter / aNext to compute a screen-space tangent and pushes the pair
 * apart perpendicular to it (camera-facing ribbon, screen-space width).
 */
export function buildMergedGeometry(items: BatchItem[]): THREE.BufferGeometry {
  let vTotal = 0;
  let iTotal = 0;
  for (const it of items) {
    const n = it.points.length;
    if (n < 2) continue;
    vTotal += n * 2;
    iTotal += (n - 1) * 6;
  }

  const center = new Float32Array(vTotal * 3);
  const prev = new Float32Array(vTotal * 3);
  const next = new Float32Array(vTotal * 3);
  const side = new Float32Array(vTotal);
  const uv = new Float32Array(vTotal * 2);
  const color = new Float32Array(vTotal * 3);
  const width = new Float32Array(vTotal);
  const opacity = new Float32Array(vTotal);
  const index = new Uint32Array(iTotal);

  let v = 0; // running vertex count
  let ii = 0; // running index count

  const put3 = (arr: Float32Array, vi: number, p: Vec3 | [number, number, number]) => {
    arr[vi * 3 + 0] = p[0];
    arr[vi * 3 + 1] = p[1];
    arr[vi * 3 + 2] = p[2];
  };

  for (const it of items) {
    const pts = it.points;
    const n = pts.length;
    if (n < 2) continue;

    // Normalised cumulative chord length -> U coordinate along the stroke.
    let cum = 0;
    const cums = new Array<number>(n);
    cums[0] = 0;
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      cum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      cums[i] = cum;
    }
    const total = cum || 1;

    const base = v;
    for (let i = 0; i < n; i++) {
      const c = pts[i];
      const p = pts[Math.max(i - 1, 0)];
      const nx = pts[Math.min(i + 1, n - 1)];
      const u = cums[i] / total;
      for (let s = 0; s < 2; s++) {
        put3(center, v, c);
        put3(prev, v, p);
        put3(next, v, nx);
        put3(color, v, it.color);
        side[v] = s === 0 ? -1 : 1;
        width[v] = it.widthPx;
        opacity[v] = it.opacity;
        uv[v * 2 + 0] = u;
        uv[v * 2 + 1] = s === 0 ? 0 : 1;
        v++;
      }
    }

    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      const b = base + i * 2 + 1;
      const c = base + (i + 1) * 2;
      const d = base + (i + 1) * 2 + 1;
      index[ii++] = a;
      index[ii++] = b;
      index[ii++] = c;
      index[ii++] = c;
      index[ii++] = b;
      index[ii++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("aCenter", new THREE.BufferAttribute(center, 3));
  geo.setAttribute("aPrev", new THREE.BufferAttribute(prev, 3));
  geo.setAttribute("aNext", new THREE.BufferAttribute(next, 3));
  geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geo.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  geo.setAttribute("aWidthPx", new THREE.BufferAttribute(width, 1));
  geo.setAttribute("aOpacity", new THREE.BufferAttribute(opacity, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}
