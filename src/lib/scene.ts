// Renderer-free entry — must never import three or touch the DOM.
// Safe for SSR / static import.
//
//   import { cityScene, DEFAULT_CITY, line } from "brushengine/scene";
//
// This is the pure scene-building toolkit: the geometry helpers and data types
// you need to author your own StrokeData[], plus the flagship `cityScene`
// generator so the playground city can be reproduced anywhere. The WebGL
// renderer (BrushEngine, brush textures, projection helpers, three) lives behind
// the main "brushengine" barrel and is intentionally absent here.

// --- geometry helpers (author your own strokes) ---
// line() + the Vec3 math it's built from (add, sub, scale, lerp, norm, cross).
export * from "../scenes/helpers";

// --- the cityscape generator (reproduce the playground scene) ---
export {
  cityScene,
  DEFAULT_CITY,
  encodeCity,
  decodeCity,
  type CityParams,
} from "../scenes/city";

// --- shared palette ---
export { PALETTE } from "../scenes/box";

// --- data types ---
export type { Vec2, Vec3, StrokeData, StrokeStyle } from "../engine/types";
