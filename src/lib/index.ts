// Public API for the brush-engine package.
//
// Quick start:
//   import { BrushEngine, cityScene, DEFAULT_CITY } from "brushengine";
//   const engine = new BrushEngine(canvas);
//   await engine.setBrushes(await loadBrushTextures());
//   engine.setStrokes(cityScene(DEFAULT_CITY));
//   engine.resize(width, height);
//   engine.start();
//
// Drive the parallax by mutating the projection's vanishing points:
//   const base = engine.getProjection();
//   engine.setProjection({ ...base, vpX: { x, y }, vpZ: { x, y } });

// --- renderer ---
export { BrushEngine } from "../engine/BrushEngine";
export { loadBrushTextures } from "../engine/brushes";
export { BRUSH_DATA_URIS } from "../engine/brushData";

// --- the cityscape generator ---
export {
  cityScene,
  DEFAULT_CITY,
  encodeCity,
  decodeCity,
  type CityParams,
} from "../scenes/city";
export { PALETTE } from "../scenes/box";

// --- projection helpers (CPU mirror of the shader; for guides/parallax math) ---
export {
  projectNDC,
  projectHomogeneous,
  meanDepth,
  type Homog,
} from "../engine/projection";

// --- types ---
export type {
  Vec2,
  Vec3,
  StrokeData,
  StrokeStyle,
  ProjectionParams,
  GlobalStyle,
} from "../engine/types";
