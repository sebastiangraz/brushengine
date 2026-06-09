# Brush Engine

A small WebGL engine (React + TypeScript + three.js, scaffolded with Vite) that
renders collections of 3D paths as **flat brush strokes** under a **custom
2-point perspective** projection with **directly placeable vanishing points**.

```bash
npm install
npm run dev      # http://localhost:5173  (playground / editor)
npm run build    # type-check + playground production build (-> dist-app/)
npm run build:lib  # build the distributable package (-> dist/)
```

## Use as a package

The renderer and the city generator ship as a framework-agnostic library
(`src/lib/index.ts`), built with Vite library mode (`npm run build:lib`). It has
**no React dependency** and a single **peer dependency on `three`**. The two
brush SVGs are base64-**inlined** (`src/engine/brushData.ts`, regenerate with
`npm run gen:brushes`), so the package is self-contained — nothing to copy or
serve.

```ts
import {
  BrushEngine, loadBrushTextures, cityScene, DEFAULT_CITY,
} from "brushengine";

const engine = new BrushEngine(canvas);          // a <canvas> element
engine.setBrushes(await loadBrushTextures());    // inlined data URIs by default
engine.setStrokes(cityScene(DEFAULT_CITY));
engine.resize(canvas.clientWidth, canvas.clientHeight);
engine.start();                                  // dirty-flagged loop; idle = free
```

The engine touches `document` at import time, so on SSR frameworks (Next, etc.)
import and construct it **client-side only** (dynamic import in an effect).

### Parallax on scroll

The vanishing points are runtime projection params, so a scroll-driven parallax
is just lerping them and calling `setProjection` — no geometry rebuild:

```ts
const base = engine.getProjection();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function onScroll(t: number) {        // t = 0..1 scroll progress through the section
  engine.setProjection({
    ...base,
    vpX:    { x: lerp(base.vpX.x,  1.3, t), y: lerp(base.vpX.y, 0.1, t) },
    vpZ:    { x: lerp(base.vpZ.x, -1.3, t), y: lerp(base.vpZ.y, 0.1, t) },
    origin: { x: base.origin.x,             y: lerp(base.origin.y, -0.4, t) },
  });
}
```

Keep VP moves modest and `perspective` low so every corner's homogeneous depth
stays `> 0` (see the projection note below). Throttle `onScroll` to rAF and only
run it while the canvas is on screen.

> The package is currently `"private": true` and named `brushengine`. To publish,
> pick a (scoped) name and remove `private` from `package.json`.

## What it does

- Strokes are 3D polylines, drawn as screen-space **ribbons** so the brush
  texture always faces the camera (billboarding) without any explicit billboard
  math — the expansion happens perpendicular to the projected tangent.
- Stroke **thickness vs. distance** is a single knob: constant screen width
  regardless of depth, full perspective foreshortening, or anything in between
  (and beyond, for exaggeration).
- The camera is a **custom projective 2-point perspective**: you place the two
  horizontal vanishing points anywhere on screen (drag the pink handles), and
  vertical world lines always stay parallel. Focal length, vertical scale, and a
  2D zoom are separate knobs.
- Brush textures are bundled SVGs (`public/brushes/`, base64-inlined into the
  package via `src/engine/brushData.ts`); the ink lives in the alpha channel and
  is recoloured per stroke. Strokes pick a brush per stroke, with a global
  override in the UI.
- **CMYK ink mix** (toggle, on by default): overlapping strokes *multiply* like
  real ink, so crossings darken — even two strokes of the same colour — while the
  canvas stays **transparent** so the page shows through. It's a two-pass pipeline
  (`BrushEngine.renderOnce` + the composite shaders):
  1. Strokes are drawn into an offscreen target cleared to **white**. RGB blends
     with a multiply (`dst * src`) using a coverage-weighted `mix(white, colour,
     a)` factor — so the target accumulates exactly the opaque-white result `T`
     (full ink darkens fully, faint/edge pixels barely darken). Alpha blends
     "over" to record coverage.
  2. A fullscreen pass **un-premultiplies `T` against white** (`rgb = (T-1+a)/a`,
     `alpha = a`) onto the transparent canvas. Over the (white) page this
     reproduces `T` at full strength — no fading — yet stays see-through where
     there's no ink, and composites correctly over any background.

  The target is half-float + MSAA (the un-premultiply divides by small alphas, so
  8-bit would band, and MSAA keeps edges smooth). Multiply is order-independent,
  so no per-stroke sorting is needed. Turn it off for ordinary alpha blending
  (single pass, straight to the canvas).

## How the 2-point projection works

The projection is a 3×4 homogeneous matrix whose columns are the screen images
of the four world basis points (see `src/engine/types.ts` and `shaders.ts`):

| world homogeneous point | maps to |
| --- | --- |
| X axis at infinity `(1,0,0,0)` | `vpX` — the +X vanishing point |
| Z axis at infinity `(0,0,1,0)` | `vpZ` — the +Z vanishing point |
| Y axis at infinity `(0,1,0,0)` | straight up → verticals stay parallel |
| world origin `(0,0,0,1)` | `origin` on screen |

For a world point `(x, y, z)`:

```
hx = x·k·vpX.x + z·k·vpZ.x + origin.x
hy = x·k·vpX.y + y·s + z·k·vpZ.y + origin.y       // s = verticalScale
hw = x·k       + z·k             + 1               // k = perspective strength
ndc = (hx/hw, hy/hw) · zoom
```

As `x → ∞` the point converges exactly to `vpX`; as `z → ∞`, to `vpZ`; vertical
lines never converge (no third vanishing point). `hw` is the homogeneous depth
term (≈1 near the origin, larger with distance) and drives the thickness knob:
`width *= mix(1, 1/hw, thicknessFalloff)`.

## Performance

The generative city can emit a few thousand strokes. To keep it smooth:

- **Batching** — strokes are grouped by brush and merged into one geometry per
  group (colour / width / opacity baked into vertex attributes), so the scene
  draws in ~3 calls instead of one per stroke.
- **Dirty flag** — the render loop only does work when projection / params /
  size actually change; between interactions it early-outs, so an idle scene
  costs nothing.
- **No per-frame sort** — multiply (ink-mix) blending is order-independent, so
  strokes are never depth-sorted. With ink-mix *off* (plain alpha), overlap
  order follows batch order rather than strict back-to-front; for the sketch
  aesthetic that's not noticeable, and it keeps dragging at 60 fps.

## Layout

```
src/
  engine/
    types.ts        projection params, stroke + style types
    projection.ts   CPU mirror of the GLSL projection (guides, sorting)
    shaders.ts      vertex (projection + ribbon expansion) + fragment shaders
    Stroke.ts       merge many strokes -> one batched ribbon geometry
    brushes.ts      load bundled SVG strokes as textures
    brushData.ts    base64-inlined brush SVGs (generated; npm run gen:brushes)
    BrushEngine.ts  renderer, per-brush batched meshes, dirty-flagged render loop
  lib/
    index.ts        public package API (re-exports engine + city + types)
  scenes/
    helpers.ts      subdivide + wobble a segment into a hand-drawn polyline
    box.ts          gridded building
    house.ts        gable house
    city.ts         generative cityscape (seeded, parametric)
  components/
    Stage.tsx       canvas + SVG overlay (draggable VP handles, guide lines)
    ControlPanel.tsx
  App.tsx
public/brushes/     stroke1.svg (scratchy), stroke2.svg (bold)
```

## Generative city scene

`scenes/city.ts` builds an architect's-sketch skyline as a pure function of
`(seed, params)`, so it's fully reproducible. Towers sit on an N×N footprint
grid viewed from the near corner; a Gaussian height envelope (and occupancy
bias) makes the centre towers tallest. Each tower is assembled from box edges
(often left partial / "half-defined"), façade grids, intermittent window
hatching, a central spire, and construction guidelines that overshoot toward
the vanishing points.

Randomness comes from a seeded `mulberry32` PRNG — no `Math.random`/`Date` in
the generator — so the same inputs always yield the same city. The panel exposes
a numeric **seed** plus a base64 **scene code** (`encodeCity`/`decodeCity`) that
captures seed + all params; copy it to reproduce the exact city on another
client. Exclusive sliders: buildings (grid size), height peak, height variability
(downward-only — adds more low-rises while preserving the peak), window density,
grid-face density, grid variability (per-face roll that spreads façade grids
symmetrically from very dense to very sparse / nearly gone — 0 means every face
matches), grid gaps (chunks the grid along the
face height — 0 saturates top-to-bottom, mid values give a single partial chunk,
high values add a striped multi-chunk mode), grid ratio (per-face chance to stretch grid cells to a non-square
aspect, up to 16:1 / 1:16 at full value), guideline density, half-box ratio, size
variation (footprint
width/depth spread — also affects the half-defined boxes), L-shapes (fraction of
buildings drawn as a tall tower + lower "foot" wing — built as a single L-solid
with no interior seam, so the side reads as one continuous face; the seed rolls a
vertical flip for top-/bottom-heavy massing and a 4-way yaw for the foot
direction), path
wobble (hand-drawn waviness on every stroke), and guideline length (overshoot
length of the construction guidelines).

Switching to the city scene also applies a worm's-eye default camera
(`CITY_PROJECTION`).

## Adding your own strokes

A stroke is just `{ points: Vec3[], style: { color, widthPx, brush, opacity } }`.
Build a `StrokeData[]` (see `src/scenes/`) and pass it to `<Stage strokes={...} />`.
Drop more SVG/PNG files in `public/brushes/`, list them in
`src/engine/brushes.ts`, and reference them by index via `style.brush`.
