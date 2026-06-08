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
   * 0..1 — grid chunking along the face height. 0 = grid fully saturates the face
   * top-to-bottom. Rising toward 0.5 = a per-face chance (≈50% at 0.5) that the
   * grid is a single chunk covering 20-60% of the face, rest blank. Above 0.5 adds
   * (up to a 20% chance at 1) a "striped" face split into 2-4 equal, evenly spaced
   * chunks.
   */
  gridGaps: number;
  /**
   * 0..1 — grid cell aspect-ratio variability. A per-face chance (rises with the
   * value) to stretch a face's grid cells into a non-square ratio — up to 16:1 or
   * 1:16 (portrait or landscape) at 1. 0 = square cells everywhere (as before).
   */
  gridRatio: number;
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
  /** 0..1 — path wobble: hand-drawn waviness applied to every stroke. */
  wobble: number;
  /** 0..1 — length of the left-in guideline / construction overshoots. */
  guidelineLength: number;
  /**
   * 0..1 — fraction of buildings that are L-shaped (a tall tower with a lower
   * "foot" wing). The seed rolls a vertical flip per building (foot at the bottom
   * = bottom-heavy, or floating near the top = top-heavy overhang) and a 4-way
   * yaw that points the foot toward the camera / left / right / away.
   */
  lShapeRatio: number;
}

export const DEFAULT_CITY: CityParams = {
  seed: 886,
  gridSize: 7,
  heightPeak: 1,
  heightVar: 1,
  windowDensity: 0.07,
  gridDensity: 0.06,
  gridVar: 0.86,
  gridGaps: 0.35,
  gridRatio: 0.3,
  guidelineDensity: 0.52,
  partialBox: 0.62,
  footprintVar: 1,
  wobble: 0.1,
  guidelineLength: 0.59,
  lShapeRatio: 0.5,
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
  "wobble",
  "heightVar",
  "gridVar",
  "gridGaps",
  "guidelineLength",
  "lShapeRatio",
  "gridRatio",
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
  const wob = 0.003 + p.wobble * 0.016;
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

  // Façade construction grid. gridGaps controls how the grid is CHUNKED along the
  // face height (not per-line noise):
  //   0   -> one chunk, fully saturated top-to-bottom.
  //   ~g  -> per-face chance (e.g. 50% at 0.5) of a single chunk covering 20-60%
  //          of the face, placed anywhere, rest blank.
  //   >.5 -> additive chance (up to 20% at 1) of a "striped" face split into 2-4
  //          equal, evenly spaced chunks.
  const faceGrid = (O: Vec3, u: Vec3, v: Vec3, uLen: number, vLen: number) => {
    const col = pick();
    // Per-face density factor (gridVar) — symmetric log-space multiplier.
    const densFactor = Math.exp((rnd() * 2 - 1) * p.gridVar * 1.6);
    // Per-face cell aspect ratio (gridRatio) — density-preserving axis split.
    let rs = 1;
    if (chance(p.gridRatio)) {
      const aspect = Math.pow(2, (rnd() * 2 - 1) * 4 * p.gridRatio); // log2 up to ±4
      rs = Math.sqrt(aspect);
    }
    const nu = Math.min(48, Math.max(1, Math.round((uLen / 0.18) * densFactor * rs)));
    const nvFull = Math.min(48, Math.max(1, Math.round((vLen / 0.22) * densFactor / rs)));

    // Decide the height chunking (bands as 0..1 fractions of the face height).
    const g = p.gridGaps;
    let bands: [number, number][];
    let capped: boolean; // draw the band's top/bottom edges so the chunk reads as a panel
    if (chance(Math.max(0, g - 0.5) * 0.4)) {
      // Striped: 2-4 equal, evenly spaced chunks.
      const K = 2 + Math.floor(rnd() * 3);
      const pad = (1 - 0.62) / 2; // each stripe fills ~62% of its slot
      bands = [];
      for (let k = 0; k < K; k++) bands.push([(k + pad) / K, (k + 1 - pad) / K]);
      capped = true;
    } else if (chance(g)) {
      // Single partial chunk covering 20-60% of the face, placed anywhere.
      const frac = rng(0.2, 0.6);
      const start = rng(0, 1 - frac);
      bands = [[start, start + frac]];
      capped = true;
    } else {
      bands = [[0, 1]]; // full, top-to-bottom
      capped = false;
    }

    const pt = (uu: number, yy: number): Vec3 =>
      add(add(O, mul(u, uu)), mul(v, yy));

    for (const [b0, b1] of bands) {
      const yA = b0 * vLen;
      const yB = b1 * vLen;
      const bandH = yB - yA;
      for (let i = 1; i < nu; i++) {
        const uu = (uLen * i) / nu;
        seg(pt(uu, yA), pt(uu, yB), col, rng(2, 3.2), 0, 0.85); // vertical spans chunk
      }
      const nvBand = Math.max(1, Math.round((nvFull * bandH) / vLen));
      const j0 = capped ? 0 : 1;
      const j1 = capped ? nvBand : nvBand - 1;
      for (let j = j0; j <= j1; j++) {
        const yy = yA + (bandH * j) / nvBand;
        seg(pt(0, yy), pt(uLen, yy), col, rng(2, 3.2), 0, 0.85); // horizontal
      }
    }
  };

  const X: Vec3 = [1, 0, 0];
  const Z: Vec3 = [0, 0, 1];
  const Y: Vec3 = [0, 1, 0];

  // Draw a single box (wireframe edges + façade grids + windows). Reused for the
  // regular towers and for each part of an L-shaped building. by0/by1 let the box
  // float vertically (e.g. the overhanging foot of a top-heavy L).
  const drawBox = (
    bx0: number,
    bx1: number,
    bz0: number,
    bz1: number,
    by0: number,
    by1: number,
    env: number,
    primary: string,
  ) => {
    const bw = bx1 - bx0;
    const bd = bz1 - bz0;
    const vLen = by1 - by0;
    const ew = 2.8 + env * 2.2;
    const ec = () => (chance(0.62) ? primary : pick());

    // Verticals (near edge solid; others may be omitted / partial).
    seg([bx0, by0, bz0], [bx0, by1, bz0], ec(), ew, 0, 1, 7);
    edge([bx0, by0, bz1], [bx0, by1, bz1], ec(), ew);
    edge([bx1, by0, bz0], [bx1, by1, bz0], ec(), ew);
    if (chance(0.4 * (1 - p.partialBox)))
      edge([bx1, by0, bz1], [bx1, by1, bz1], ec(), ew * 0.8);

    // Roof edges.
    edge([bx0, by1, bz0], [bx0, by1, bz1], ec(), ew);
    edge([bx0, by1, bz0], [bx1, by1, bz0], ec(), ew);
    edge([bx0, by1, bz1], [bx1, by1, bz1], ec(), ew * 0.8);
    edge([bx1, by1, bz0], [bx1, by1, bz1], ec(), ew * 0.8);
    // Ground / underside edges.
    edge([bx0, by0, bz0], [bx0, by0, bz1], ec(), ew * 0.8);
    edge([bx0, by0, bz0], [bx1, by0, bz0], ec(), ew * 0.8);

    // Façade grids (left + front faces).
    if (chance(p.gridDensity)) faceGrid([bx0, by0, bz0], Z, Y, bd, vLen);
    if (chance(p.gridDensity)) faceGrid([bx0, by0, bz0], X, Y, bw, vLen);

    // Windows.
    const wp = 1 + Math.round(p.windowDensity * 2);
    for (let k = 0; k < wp; k++) {
      if (chance(p.windowDensity)) windowPatch([bx0, by0, bz0], X, Y, bw, vLen);
      if (chance(p.windowDensity)) windowPatch([bx0, by0, bz0], Z, Y, bd, vLen);
    }
  };

  // Draw an L-shaped building as a SINGLE solid (no interior seam between the
  // tower and the foot) — like a subtractive boolean, so the L's side reads as
  // one continuous face. The L cross-section is extruded along the depth axis.
  // `yaw` (0..3) points the foot toward the camera / left / right / away, and
  // `topHeavy` flips it vertically (foot floating at the top vs on the ground).
  const drawLPrism = (
    bx0: number,
    bx1: number,
    bz0: number,
    bz1: number,
    h: number,
    topHeavy: boolean,
    yaw: number,
    towerFrac: number,
    footHfrac: number,
    env: number,
    primary: string,
  ) => {
    const bw = bx1 - bx0;
    const bd = bz1 - bz0;
    const ew = 2.8 + env * 2.2;
    const ec = () => (chance(0.62) ? primary : pick());
    const footAxisX = yaw === 0 || yaw === 2;
    const La = footAxisX ? bw : bd; // length along the foot axis
    const Lb = footAxisX ? bd : bw; // depth
    const tw = La * towerFrac; // tower width along the foot axis
    const fh = h * footHfrac; // foot height

    // foot-axis coord a + depth coord b -> world X,Z (height handled by wy()).
    const toXZ = (a: number, b: number): [number, number] => {
      if (yaw === 0) return [bx0 + a, bz0 + b];
      if (yaw === 2) return [bx1 - a, bz0 + b];
      if (yaw === 1) return [bx0 + b, bz0 + a];
      return [bx0 + b, bz1 - a];
    };
    const wy = (y: number) => (topHeavy ? h - y : y);
    const P = (a: number, b: number, y: number): Vec3 => {
      const [wx, wz] = toXZ(a, b);
      return [wx, wy(y), wz];
    };

    // 6-vertex L outline in (foot-axis a, height y) — no interior edges.
    const V: [number, number][] = [
      [0, 0],
      [La, 0],
      [La, fh],
      [tw, fh],
      [tw, h],
      [0, h],
    ];
    const loop: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
    ];

    // Near tower vertical solid; the rest of the outline + back + depth edges are
    // sketchy / omittable (respecting partialBox).
    seg(P(0, 0, 0), P(0, 0, h), ec(), ew, 0, 1, 7);
    for (const [i, j] of loop) {
      if (!(i === 5 && j === 0))
        edge(P(V[i][0], 0, V[i][1]), P(V[j][0], 0, V[j][1]), ec(), ew);
      edge(P(V[i][0], Lb, V[i][1]), P(V[j][0], Lb, V[j][1]), ec(), ew * 0.85);
    }
    for (let k = 0; k < 6; k++) {
      edge(P(V[k][0], 0, V[k][1]), P(V[k][0], Lb, V[k][1]), ec(), ew * 0.85);
    }

    // Windows / grids on the rectangular sub-faces (tower + foot).
    const footDir: Vec3 = footAxisX
      ? [yaw === 0 ? 1 : -1, 0, 0]
      : [0, 0, yaw === 1 ? 1 : -1];
    const depthDir: Vec3 = footAxisX ? [0, 0, 1] : [1, 0, 0];
    const [tX, tZ] = toXZ(0, 0);
    const towerO: Vec3 = [tX, 0, tZ];
    const [fX, fZ] = toXZ(tw, 0);
    const footO: Vec3 = [fX, topHeavy ? h - fh : 0, fZ];

    if (chance(p.gridDensity)) faceGrid(towerO, footDir, Y, tw, h);
    if (chance(p.gridDensity)) faceGrid(towerO, depthDir, Y, Lb, h);
    if (chance(p.gridDensity)) faceGrid(footO, footDir, Y, La - tw, fh);

    const wp = 1 + Math.round(p.windowDensity * 2);
    for (let k = 0; k < wp; k++) {
      if (chance(p.windowDensity)) windowPatch(towerO, footDir, Y, tw, h);
      if (chance(p.windowDensity)) windowPatch(towerO, depthDir, Y, Lb, h);
      if (chance(p.windowDensity)) windowPatch(footO, footDir, Y, La - tw, fh);
    }
  };

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

      // tower footprint — equals the full lot unless this is an L-shaped building.
      let tx0 = x0;
      let tx1 = x1;
      let tz0 = z0;
      let tz1 = z1;
      if (chance(p.lShapeRatio)) {
        // Two seed rolls: a vertical flip (top- vs bottom-heavy) and a 4-way yaw
        // for the foot direction. Drawn as one L-solid (no interior seam).
        const topHeavy = chance(0.5);
        const yaw = Math.floor(rng(0, 4));
        const towerFrac = rng(0.4, 0.62);
        const footHfrac = rng(0.28, 0.5);
        drawLPrism(
          x0,
          x1,
          z0,
          z1,
          h,
          topHeavy,
          yaw,
          towerFrac,
          footHfrac,
          env,
          primary,
        );
        // Tower footprint, for the guideline / spire anchors below.
        const tw = (yaw === 0 || yaw === 2 ? bw : bd) * towerFrac;
        if (yaw === 0) tx1 = x0 + tw;
        else if (yaw === 2) tx0 = x1 - tw;
        else if (yaw === 1) tz1 = z0 + tw;
        else tz0 = z1 - tw;
      } else {
        drawBox(x0, x1, z0, z1, 0, h, env, primary);
      }

      // Per-building guidelines: extend the tower's near edge up + roof out.
      if (chance(p.guidelineDensity)) {
        const over =
          (0.2 + p.guidelineLength * 2.5) * rng(0.4, 1.1) * (0.5 + env);
        seg([tx0, h, tz0], [tx0, h + over, tz0], primary, 2, 0, 0.6, 4);
      }
      if (chance(p.guidelineDensity * 0.7)) {
        const over = (0.2 + p.guidelineLength * 2.2) * rng(0.4, 1);
        seg([tx1, h, tz0], [tx1 + over, h, tz0], primary, 2, 0, 0.5, 4);
      }
      if (chance(p.guidelineDensity * 0.7)) {
        const over = (0.2 + p.guidelineLength * 2.2) * rng(0.4, 1);
        seg([tx0, h, tz1], [tx0, h, tz1 + over], primary, 2, 0, 0.5, 4);
      }

      // Central spire/antenna for the very tallest towers — visual tension.
      if (env > 0.8 && chance(0.85)) {
        const col = pick();
        const cx = (tx0 + tx1) / 2;
        const cz = (tz0 + tz1) / 2;
        const sp = rng(1.1, 2.3) * (0.6 + p.heightPeak);
        seg([cx, h, cz], [cx, h + sp, cz], col, 3, 0, 0.9, 4);
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

  // const span = N * cell;
  // const nGuides = Math.round(p.guidelineDensity * 7);
  // for (let g = 0; g < nGuides; g++) {
  //   const col = pick();
  //   const op = rng(0.25, 0.5);
  //   const mode = Math.floor(rng(0, 3));
  //   if (mode === 0) {
  //     const y = rng(0, 2.4);
  //     const z = rng(-0.2, span);
  //     seg([-0.5, y, z], [span + rng(0.5, 2), y, z], col, 1.1, 0, op, 3);
  //   } else if (mode === 1) {
  //     const y = rng(0, 2.4);
  //     const x = rng(-0.2, span);
  //     seg([x, y, -0.5], [x, y, span + rng(0.5, 2)], col, 1.1, 0, op, 3);
  //   } else {
  //     const x = rng(0, span);
  //     const z = rng(0, span);
  //     seg([x, -0.2, z], [x, rng(2, 4.5), z], col, 1.1, 0, op, 3);
  //   }
  // }

  return strokes;
}
