export type Vec3 = [number, number, number];

/** A point on screen in normalized device coords (NDC), range roughly [-1, 1]. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Parameters that fully describe the custom 2-point perspective projection.
 *
 * The projection is a 3x4 homogeneous matrix whose columns are the screen
 * images of the four "world basis" homogeneous points:
 *   - X axis at infinity  (1,0,0,0) -> vpX   (vanishing point of world +X lines)
 *   - Y axis at infinity  (0,1,0,0) -> straight up (verticals stay parallel)
 *   - Z axis at infinity  (0,0,1,0) -> vpZ   (vanishing point of world +Z lines)
 *   - world origin        (0,0,0,1) -> origin
 *
 * All screen positions are in NDC (-1..1), x positive right, y positive up.
 */
export interface ProjectionParams {
  /** Vanishing point for world +X lines (NDC). */
  vpX: Vec2;
  /** Vanishing point for world +Z lines (NDC). */
  vpZ: Vec2;
  /** Screen position of the world origin (NDC). */
  origin: Vec2;
  /**
   * Perspective strength along X / Z. Higher = stronger convergence + larger
   * near scale (wide-angle feel). Lower = flatter, telephoto feel.
   * This is the "focal length" knob (inverse-ish of focal length).
   */
  perspective: number;
  /** Vertical scale (magnification of world +Y). Verticals never converge. */
  verticalScale: number;
  /** Pure 2D zoom applied after projection, about screen centre. */
  zoom: number;
}

export interface StrokeStyle {
  /** Base half-extent? No — full stroke width in pixels at depth w = 1. */
  widthPx: number;
  /** CSS color string. */
  color: string;
  /** Index into the loaded brush texture set. */
  brush: number;
  /** Opacity 0..1. */
  opacity: number;
}

export interface StrokeData {
  /** Ordered 3D points describing the centre-line of the stroke. */
  points: Vec3[];
  style: StrokeStyle;
}

export interface GlobalStyle {
  /**
   * 0 = constant screen thickness regardless of distance.
   * 1 = full perspective foreshortening (far strokes get thinner).
   * Values >1 exaggerate.
   */
  thicknessFalloff: number;
  /**
   * If set, force every stroke to use this brush texture index, ignoring each
   * stroke's own `style.brush`. null = use per-stroke brush.
   */
  brushOverride: number | null;
  /**
   * CMYK-style ink mixing: overlapping strokes multiply (darken) like real ink,
   * so even two strokes of the same colour deepen where they cross. When false,
   * strokes use ordinary alpha blending over a transparent canvas.
   */
  inkBlend: boolean;
}
