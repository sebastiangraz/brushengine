# Task: expose a DOM-free `brushengine/scene` subpath export

## Context
`brushengine` currently ships a single barrel entry (`.` → `dist/brushengine.js`)
that mixes the WebGL renderer with the pure scene generator. `BrushEngine`'s
module touches `document` at import time and pulls in `three`, so consumers can't
import the pure scene code (`cityScene`, `DEFAULT_CITY`, `PALETTE`, the `line`
wobble helper, the data types) without dragging the whole DOM-coupled bundle in —
which breaks SSR and static/build-time imports.

A downstream site (yellownhill) vendored `line` + `PALETTE` into its own copy of
the city scene just to avoid this. We own brushengine, so the right fix is a
second entry point that re-exports ONLY the pure, renderer-free code.

The scene modules are already pure: `src/scenes/{city,box,helpers}.ts` import
from `src/engine/types.ts` as `import type` (erased) and have no `three`/DOM
runtime dependency. Nothing needs to be rewritten — only re-exported through a
new entry and wired into the build.

## Goal
Add a `./scene` subpath export that is guaranteed free of `three`, `BrushEngine`,
and any `document`/DOM access, so it's safe to import statically and during SSR.
Keep the existing `.` barrel fully backward-compatible.

## Changes

1. **New entry `src/lib/scene.ts`** — pure re-exports only:
   - From `../scenes/city`: `cityScene`, `DEFAULT_CITY`, `encodeCity`,
     `decodeCity`, `type CityParams`.
   - From `../scenes/box`: `PALETTE`. (Leave `buildingScene` exported too if it's
     pure — verify it doesn't touch the engine.)
   - From `../scenes/helpers`: `line`.
   - From `../engine/types`: `type Vec2, Vec3, StrokeData, StrokeStyle`.
   - Do NOT export `BrushEngine`, `loadBrushTextures`, `BRUSH_DATA_URIS`,
     projection helpers, or anything importing `three`.
   - Add a top-of-file comment: "Renderer-free entry — must never import three or
     touch the DOM. Safe for SSR / static import."

2. **`package.json` `exports`** — add the subpath alongside `.` (keep `.` as-is):
   ```json
   "exports": {
     ".": {
       "types": "./dist/types/lib/index.d.ts",
       "import": "./dist/brushengine.js",
       "require": "./dist/brushengine.cjs"
     },
     "./scene": {
       "types": "./dist/types/lib/scene.d.ts",
       "import": "./dist/scene.js",
       "require": "./dist/scene.cjs"
     }
   }
   ```

3. **`vite.lib.config.ts`** — switch the single `lib.entry` to a multi-entry map
   so both bundles build. Drop `name` (UMD global is invalid with multiple
   entries; es+cjs don't need it). Keep `three` external.
   ```ts
   lib: {
     entry: {
       brushengine: resolve(__dirname, "src/lib/index.ts"),
       scene: resolve(__dirname, "src/lib/scene.ts"),
     },
     formats: ["es", "cjs"],
     fileName: (format, entryName) =>
       `${entryName}.${format === "es" ? "js" : "cjs"}`,
   },
   ```
   (`src/lib/index.ts` keeps emitting as `brushengine.js`/`.cjs` — unchanged
   filenames, so the `.` export and any existing consumers are untouched.)

4. **Types** — `tsconfig.lib.json` already `include`s `src/lib`, so
   `dist/types/lib/scene.d.ts` will be emitted automatically. Confirm it appears
   after a build; no config change expected.

5. **Version + docs** — additive change, bump minor: `0.1.1` → `0.2.0`. Add a
   line to the README quickstart showing the renderer-free import:
   ```ts
   import { cityScene, DEFAULT_CITY, line } from "brushengine/scene"; // no three, SSR-safe
   ```

## Acceptance criteria
- `npm run build:lib` produces `dist/scene.js`, `dist/scene.cjs`, and
  `dist/types/lib/scene.d.ts`.
- `dist/scene.js` contains **no** reference to `three`, `BrushEngine`, `document`,
  `window`, or `WebGL`. Verify mechanically, e.g.:
  `grep -nE "three|BrushEngine|document|window|WebGL" dist/scene.js` returns nothing.
- `import("brushengine/scene")` resolves and exposes `cityScene`, `DEFAULT_CITY`,
  `encodeCity`, `decodeCity`, `PALETTE`, `line`, and the data types.
- The `.` barrel is unchanged: `dist/brushengine.js`/`.cjs` still build with the
  same filenames and the same full export surface.
- `tsc -b` / type emission passes clean.

## Verification
- Build the lib, then run the grep guard above on `dist/scene.js` AND `dist/scene.cjs`.
- Sanity-import in Node (no DOM): a throwaway
  `node -e "import('./dist/scene.js').then(m => console.log(Object.keys(m)))"`
  must run without a `document is not defined` error and list the expected exports.
- Optionally add a tiny build-time assertion script (run in `prepublishOnly`)
  that fails if the grep guard matches, so the renderer can never leak into the
  scene entry again.

## Out of scope
- No changes to the scene generation logic or the renderer.
- Don't remove or rename anything from the `.` barrel.
- Don't add new runtime deps; `three` stays a peer dependency, external.
