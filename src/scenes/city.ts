import type { StrokeData, Vec3 } from "../engine/types";
import { line } from "./helpers";
import { PALETTE } from "./box";

/**
 * Generative cityscape — an architect's quick 2-point sketch. Everything is a
 * pure function of (seed, params), so the same inputs always produce the same
 * scene. Share/reproduce a scene with the base64 code from `encodeCity`.
 */
export interface CityParams {
  seed: number;
  /** Footprint grid is gridSize x gridSize lots. */
  gridSize: number;
  /** 0..1 — how much taller the centre towers grow (visual tension). */
  heightPeak: number;
  /**
   * 0..1 — height variability. Higher pulls more buildings down toward shorter
   * heights (downward-only), so the skyline gets busier with low-rises while the
   * peak ceiling set by `heightPeak` is preserved (the tallest towers stay tall).
   */
  heightVar: number;
  /** 0..1 — how often façades get window patches. */
  windowDensity: number;
  /** 0..1 — how often façades get a full construction grid. */
  gridDensity: number;
  /**
   * 0..1 — per-face grid density variability. Higher randomly increases the grid
   * line density, rolled independently per face (not per building), so a single
   * building can show several different grid densities across its faces.
   */
  gridVar: number;
  /**
   * 0..1 — grid intermittence. Higher randomly drops individual grid lines (like
   * the window patches), leaving partial / broken grids across a face. 0 = solid,
   * complete grids.
   */
  gridGaps: number;
  /** 0..1 — how many left-in guideline / construction strokes. */
  guidelineDensity: number;
  /** 0..1 — how often box edges are omitted or only partially drawn. */
  partialBox: number;
  /**
   * 0..1 — variability of each building's footprint width & depth. 0 = uniform
   * blocks; higher = a more organic mix of slim and broad masses (also applies
   * to the half-defined boxes, since they share the footprint).
   */
  footprintVar: number;
  /** 0..1 — hand-drawn looseness: wobble + guideline overshoot. */
  looseness: number;
}

export const DEFAULT_CITY: CityParams = {
  seed: 974961287,
  gridSize: 6,
  heightPeak: 1,
  heightVar: 1,
  windowDensity: 0.16,
  gridDensity: 0.1,
  gridVar: 0.83,
  gridGaps: 0.35,
  guidelineDensity: 1,
  partialBox: 0.88,
  footprintVar: 1,
  looseness: 0.3,
};

const ORDER: (keyof CityParams)[] = [
  "seed",
  "gridSize",
  "heightPeak",
  "windowDensity",
  "gridDensity",
  "guidelineDensity",
  "partialBox",
  "footprintVar",
  "looseness",
  "heightVar",
  "gridVar",
  "gridGaps",
];

/** Compact, copy-pasteable scene code (base64 of the ordered param array). */
export function encodeCity(p: CityParams): string {
  const arr = ORDER.map((k) => p[k]);
  return btoa(JSON.stringify(arr));
}

/** Decode a scene code back to params (returns null if it isn't valid). */
export function decodeCity(code: string): CityParams | null {
  try {
    const arr = JSON.parse(atob(code.trim()));
    if (!Array.isArray(arr)) return null;
    const out = { ...DEFAULT_CITY };
    ORDER.forEach((k, i) => {
      if (typeof arr[i] === "number") (out[k] as number) = arr[i];
    });
    return out;
  } catch {
    return null;
  }
}

// --- deterministic PRNG -----------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- small vector helpers ---------------------------------------------------
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function cityScene(p: CityParams): StrokeData[] {
  const rnd = mulberry32(Math.floor(p.seed));
  const rng = (lo = 0, hi = 1) => lo + (hi - lo) * rnd();
  const chance = (q: number) => rnd() < q;
  const colors = [PALETTE.teal, PALETTE.red, PALETTE.yellow];
  const pick = () => colors[Math.floor(rnd() * colors.length)];
  const warm = () => (chance(0.5) ? PALETTE.red : PALETTE.yellow);

  const strokes: StrokeData[] = [];
  let s = 0;
  const wob = 0.003 + p.looseness * 0.016;
  const push = (
    pts: Vec3[],
    color: string,
    widthPx: number,
    brush = 0,
    opacity = 1,
  ) => strokes.push({ points: pts, style: { color, widthPx, brush, opacity } });
  const seg = (
    a: Vec3,
    b: Vec3,
    color: string,
    w: number,
    brush = 0,
    op = 1,
    divs = 6,
  ) => push(line(a, b, divs, wob, s++), color, w, brush, op);

  // An edge that may be omitted or only partially drawn (half-defined boxes).
  const edge = (a: Vec3, b: Vec3, color: string, w: number, brush = 0) => {
    if (chance(p.partialBox * 0.45)) return; // omit entirely
    if (chance(p.partialBox * 0.5)) {
      const t0 = rng(0, 0.35);
      const t1 = rng(0.65, 1);
      seg(lerp(a, b, t0), lerp(a, b, t1), color, w, brush, 0.95);
    } else {
      seg(a, b, color, w, brush);
    }
  };

  const N = Math.max(2, Math.round(p.gridSize));
  const cell = 0.48;
  const center = (N - 1) / 2;
  const sigma = Math.max(0.8, N * 0.3);

  // Window patch: stacked short horizontal brush ticks on a face.
  // O = face origin, u = width direction, v = up; uLen/vLen the extents.
  const windowPatch = (
    O: Vec3,
    u: Vec3,
    v: Vec3,
    uLen: number,
    vLen: number,
  ) => {
    const col = chance(0.7) ? warm() : PALETTE.teal;
    const u0 = rng(0.04, 0.2) * uLen;
    const w = rng(0.45, 0.85) * uLen;
    const v0 = rng(0.05, 0.25) * vLen;
    const v1 = vLen * rng(0.7, 0.96);
    const rows = Math.max(3, Math.round((v1 - v0) / 0.07));
    for (let r = 0; r <= rows; r++) {
      if (!chance(0.9)) continue; // intermittent
      const vy = v0 + ((v1 - v0) * r) / rows;
      const a = add(add(O, mul(u, u0)), mul(v, vy));
      const b = add(add(O, mul(u, u0 + w * rng(0.7, 1))), mul(v, vy));
      seg(a, b, col, rng(2, 3.2), 1, 0.95, 2);
    }
  };

  // Full façade construction grid.
  const faceGrid = (O: Vec3, u: Vec3, v: Vec3, uLen: number, vLen: number) => {
    const col = pick();
    // Per-face density factor: a symmetric (log-space) multiplier around the base
    // density, rolled independently per face. gridVar widens the spread in both
    // directions, so faces range from much denser to very sparse / nearly gone;
    // at gridVar 0 the factor is exactly 1 and every face matches.
    const densFactor = Math.exp((rnd() * 2 - 1) * p.gridVar * 1.6);
    const nu = Math.max(1, Math.round((uLen / 0.18) * densFactor));
    const nv = Math.max(1, Math.round((vLen / 0.22) * densFactor));
    // Per-line keep probability — gridGaps randomly drops lines for a partial,
    // broken grid (like the intermittent window rows). 0 = every line drawn.
    const keep = 1 - p.gridGaps * 0.85;
    for (let i = 1; i < nu; i++) {
      if (!chance(keep)) continue;
      const uu = (uLen * i) / nu;
      seg(
        add(O, mul(u, uu)),
        add(add(O, mul(u, uu)), mul(v, vLen)),
        col,
        rng(2, 3.2),
        0,
        0.85,
      );
    }
    for (let j = 1; j < nv; j++) {
      if (!chance(keep)) continue;
      const vv = (vLen * j) / nv;
      seg(
        add(O, mul(v, vv)),
        add(add(O, mul(v, vv)), mul(u, uLen)),
        col,
        rng(2, 3.2),
        0,
        0.85,
      );
    }
  };

  const X: Vec3 = [1, 0, 0];
  const Z: Vec3 = [0, 0, 1];
  const Y: Vec3 = [0, 1, 0];

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const di = i - center;
      const dj = j - center;
      const env = Math.exp(-(di * di + dj * dj) / (2 * sigma * sigma)); // 1 centre -> 0 edge
      if (!chance(0.22 + 0.78 * env)) continue; // occupancy biased to centre

      const gap = cell * 0.06;
      // Footprint width/depth vary independently; the spread is the slider.
      const spread = p.footprintVar * 0.5;
      const frac = () =>
        Math.max(0.28, Math.min(1.3, 0.78 + (rnd() * 2 - 1) * spread));
      const bw = cell * frac();
      const bd = cell * frac();
      const x0 = i * cell + gap + rng(0, cell * 0.06);
      const z0 = j * cell + gap + rng(0, cell * 0.06);
      const x1 = x0 + bw;
      const z1 = z0 + bd;
      // Envelope sets the height ceiling (peak); variability only pulls down,
      // and is tapered near the centre so the tallest peak towers stay tall.
      const envTerm = 0.4 + p.heightPeak * 4.6 * env;
      const varAmt = p.heightVar * (1 - env * 0.55);
      const minF = 1 - varAmt * 0.85;
      const h = 0.8 + envTerm * (minF + (1 - minF) * rnd());

      const primary = pick();
      const ec = () => (chance(0.62) ? primary : pick());
      const ew = 2.8 + env * 2.2;

      // Near vertical edge — the key edge, almost always drawn.
      seg([x0, 0, z0], [x0, h, z0], ec(), ew, 0, 1, 7);
      // Outer verticals + far vertical (often left undefined).
      edge([x0, 0, z1], [x0, h, z1], ec(), ew);
      edge([x1, 0, z0], [x1, h, z0], ec(), ew);
      if (chance(0.4 * (1 - p.partialBox)))
        edge([x1, 0, z1], [x1, h, z1], ec(), ew * 0.8);

      // Roof edges.
      edge([x0, h, z0], [x0, h, z1], ec(), ew);
      edge([x0, h, z0], [x1, h, z0], ec(), ew);
      edge([x0, h, z1], [x1, h, z1], ec(), ew * 0.8);
      edge([x1, h, z0], [x1, h, z1], ec(), ew * 0.8);
      // Ground contact.
      edge([x0, 0, z0], [x0, 0, z1], ec(), ew * 0.8);
      edge([x0, 0, z0], [x1, 0, z0], ec(), ew * 0.8);

      // Façade grids.
      if (chance(p.gridDensity)) faceGrid([x0, 0, z0], Z, Y, bd, h); // left face
      if (chance(p.gridDensity)) faceGrid([x0, 0, z0], X, Y, bw, h); // front face

      // Windows.
      const wp = 1 + Math.round(p.windowDensity * 2);
      for (let k = 0; k < wp; k++) {
        if (chance(p.windowDensity)) windowPatch([x0, 0, z0], X, Y, bw, h);
        if (chance(p.windowDensity)) windowPatch([x0, 0, z0], Z, Y, bd, h);
      }

      // Per-building guidelines: extend the near edge up (spire) and roof out.
      if (chance(p.guidelineDensity)) {
        const over = (0.4 + p.looseness * 1.8) * rng(0.4, 1.1) * (0.5 + env);
        seg([x0, h, z0], [x0, h + over, z0], primary, 1.3, 0, 0.6, 4);
      }
      if (chance(p.guidelineDensity * 0.7)) {
        const over = (0.4 + p.looseness * 1.5) * rng(0.4, 1);
        seg([x1, h, z0], [x1 + over, h, z0], primary, 1.2, 0, 0.5, 4);
      }
      if (chance(p.guidelineDensity * 0.7)) {
        const over = (0.4 + p.looseness * 1.5) * rng(0.4, 1);
        seg([x0, h, z1], [x0, h, z1 + over], primary, 1.2, 0, 0.5, 4);
      }

      // Central spire/antenna for the very tallest towers — visual tension.
      if (env > 0.8 && chance(0.85)) {
        const col = pick();
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const sp = rng(1.1, 2.3) * (0.6 + p.heightPeak);
        seg([cx, h, cz], [cx, h + sp, cz], col, 2.2, 0, 0.9, 4);
        for (let t = 0; t < 4; t++) {
          const yy = h + sp * (0.4 + t * 0.16);
          const r = (0.05 * (4 - t)) / 4 + 0.02;
          seg([cx - r, yy, cz], [cx + r, yy, cz], col, 2, 1, 0.85, 2);
        }
      }
    }
  }

  // Global construction guidelines: long axis-aligned lines that converge to the
  // vanishing points (X-parallel -> VP→X, Z-parallel -> VP→Z) plus stray verticals.
  const span = N * cell;
  const nGuides = Math.round(p.guidelineDensity * 7);
  for (let g = 0; g < nGuides; g++) {
    const col = pick();
    const op = rng(0.25, 0.5);
    const mode = Math.floor(rng(0, 3));
    if (mode === 0) {
      const y = rng(0, 2.4);
      const z = rng(-0.2, span);
      seg([-0.5, y, z], [span + rng(0.5, 2), y, z], col, 1.1, 0, op, 3);
    } else if (mode === 1) {
      const y = rng(0, 2.4);
      const x = rng(-0.2, span);
      seg([x, y, -0.5], [x, y, span + rng(0.5, 2)], col, 1.1, 0, op, 3);
    } else {
      const x = rng(0, span);
      const z = rng(0, span);
      seg([x, -0.2, z], [x, rng(2, 4.5), z], col, 1.1, 0, op, 3);
    }
  }

  return strokes;
}
