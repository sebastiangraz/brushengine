import type { StrokeData, Vec3 } from "../engine/types";
import { line } from "./helpers";

export const PALETTE = {
  yellow: "#f5c518",
  red: "#ee4d5a",
  teal: "#16a3b8",
};

/**
 * A gridded building box. The near vertical edge sits at world origin; the
 * left face (yellow) recedes along +Z toward the left VP, the right face (red)
 * recedes along +X toward the right VP. Silhouette edges are teal.
 */
export function buildingScene(): StrokeData[] {
  const W = 1.6; // +X extent (right / red face)
  const D = 1.5; // +Z extent (left / yellow face)
  const H = 1.6; // +Y extent (up)
  const cols = 3; // grid divisions per face
  const rows = 4;

  const strokes: StrokeData[] = [];
  let seed = 0;
  const push = (
    pts: Vec3[],
    color: string,
    widthPx: number,
    brush = 1,
    opacity = 1
  ) => strokes.push({ points: pts, style: { color, widthPx, brush, opacity } });

  // ---- Yellow left face (plane x = 0), grid in (z, y) ----
  for (let c = 1; c < cols; c++) {
    const z = (D * c) / cols;
    push(line([0, 0, z], [0, H, z], 10, 0.025, seed++), PALETTE.yellow, 11, 1, 1);
  }
  for (let r = 1; r < rows; r++) {
    const y = (H * r) / rows;
    push(line([0, y, 0], [0, y, D], 12, 0.025, seed++), PALETTE.yellow, 11, 1, 1);
  }

  // ---- Red right face (plane z = 0), grid in (x, y) ----
  for (let c = 1; c < cols; c++) {
    const x = (W * c) / cols;
    push(line([x, 0, 0], [x, H, 0], 10, 0.025, seed++), PALETTE.red, 11, 1, 1);
  }
  for (let r = 1; r < rows; r++) {
    const y = (H * r) / rows;
    push(line([0, y, 0], [W, y, 0], 12, 0.025, seed++), PALETTE.red, 11, 1, 1);
  }

  // ---- Teal silhouette / key edges ----
  const W2 = 16;
  // near vertical edge
  push(line([0, 0, 0], [0, H, 0], 12, 0.02, seed++), PALETTE.teal, W2, 1);
  // top edges receding to each VP
  push(line([0, H, 0], [W, H, 0], 12, 0.02, seed++), PALETTE.teal, W2, 1);
  push(line([0, H, 0], [0, H, D], 12, 0.02, seed++), PALETTE.teal, W2, 1);
  // bottom edges receding to each VP
  push(line([0, 0, 0], [W, 0, 0], 12, 0.02, seed++), PALETTE.teal, W2, 1);
  push(line([0, 0, 0], [0, 0, D], 12, 0.02, seed++), PALETTE.teal, W2, 1);
  // far vertical edges of each face
  push(line([W, 0, 0], [W, H, 0], 10, 0.02, seed++), PALETTE.red, 11, 1, 1);
  push(line([0, 0, D], [0, H, D], 10, 0.02, seed++), PALETTE.yellow, 11, 1, 1);

  return strokes;
}
