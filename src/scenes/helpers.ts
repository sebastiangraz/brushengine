import type { Vec3 } from "../engine/types";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  add(a, scale(sub(b, a), t));

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Subdivide segment a->b into a wobbly polyline so it reads as a hand-drawn
 * brush stroke. Wobble is deterministic (seeded by index) and perpendicular to
 * the line, with the ends pinned so corners stay crisp.
 */
export function line(
  a: Vec3,
  b: Vec3,
  segments = 10,
  wobble = 0.02,
  seed = 0
): Vec3[] {
  const dir = norm(sub(b, a));
  // A perpendicular basis to displace within.
  let up: Vec3 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const p1 = norm(cross(dir, up));
  const p2 = norm(cross(dir, p1));
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const env = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
    const w1 = Math.sin(t * 6.3 + seed * 1.7) * wobble * env;
    const w2 = Math.cos(t * 4.1 + seed * 2.3) * wobble * 0.6 * env;
    let p = lerp(a, b, t);
    p = add(p, scale(p1, w1));
    p = add(p, scale(p2, w2));
    pts.push(p);
  }
  return pts;
}
