import type { StrokeData, Vec3 } from "../engine/types";
import { line } from "./helpers";
import { PALETTE } from "./box";

/**
 * A gable house, centred on the world origin in X. The front face sits at z = 0
 * (yellow gable); the right side recedes along +Z (teal ridge + side); the base
 * is red.
 */
export function houseScene(): StrokeData[] {
  const W = 1.8; // total +/-X width
  const D = 1.6; // +Z depth (receding side)
  const H = 1.2; // wall height
  const rh = 0.85; // roof rise
  const x0 = -W / 2;
  const x1 = W / 2;

  const apexF: Vec3 = [0, H + rh, 0];
  const apexB: Vec3 = [0, H + rh, D];

  const strokes: StrokeData[] = [];
  let seed = 0;
  const push = (pts: Vec3[], color: string, widthPx = 14, brush = 1) =>
    strokes.push({ points: pts, style: { color, widthPx, brush, opacity: 1 } });

  // ---- Front gable (z = 0) — yellow ----
  push(line([x0, 0, 0], [x0, H, 0], 10, 0.02, seed++), PALETTE.yellow);
  push(line([x1, 0, 0], [x1, H, 0], 10, 0.02, seed++), PALETTE.yellow);
  push(line([x0, H, 0], [x1, H, 0], 10, 0.02, seed++), PALETTE.yellow);
  push(line([x0, H, 0], apexF, 10, 0.02, seed++), PALETTE.yellow);
  push(line([x1, H, 0], apexF, 10, 0.02, seed++), PALETTE.yellow);

  // ---- Receding right side (+Z) — teal ----
  push(line(apexF, apexB, 12, 0.02, seed++), PALETTE.teal); // ridge
  push(line([x1, H, 0], [x1, H, D], 12, 0.02, seed++), PALETTE.teal); // eave
  push(line(apexB, [x1, H, D], 10, 0.02, seed++), PALETTE.teal); // back roof edge
  push(line([x1, 0, D], [x1, H, D], 10, 0.02, seed++), PALETTE.teal); // far wall

  // ---- Base lines — red ----
  push(line([x0, 0, 0], [x1, 0, 0], 12, 0.02, seed++), PALETTE.red); // front base
  push(line([x1, 0, 0], [x1, 0, D], 12, 0.02, seed++), PALETTE.red); // side base

  return strokes;
}
