# Render perf testing

A small, CI-friendly benchmark for the WebGL render path. It exists to catch
**regressions**, not to report absolute hardware performance.

## Why it's built this way

Two facts make browser WebGL perf testing different from normal benchmarking:

1. **Browsers fuzz GPU timing.** Since Spectre, `performance.now()` is coarsened
   and the real GPU timer (`EXT_disjoint_timer_query_webgl2`) is gated/usually
   unavailable. You can't get trustworthy "GPU milliseconds" from automation.
2. **CI has no GPU.** GitHub Actions renders WebGL via **SwiftShader** (software),
   so absolute frame times in CI don't reflect real user hardware.

So we measure two different kinds of signal and treat them differently:

| Signal | What | Noise | Role |
|---|---|---|---|
| **Structural** | draw calls, triangles, shader programs, geometry/texture count (`renderer.info`) | none — deterministic | **Hard gate** (fails CI) |
| **CPU timing** | JS time spent in `engine.render()`, many samples, min + median | low on SwiftShader | **Trend only** (never fails) |

The structural metrics are the high-value part: they provably catch things like a
refactor that turns the merged draw batches back into one-call-per-stroke, a
shader-program or texture leak (count climbs over frames), or an accidental extra
pass. CPU timing is shown so you can _see_ a slowdown trend, but it never fails
the build, because it's noisy and runs on software GL in CI.

GPU wall-time is deliberately **not** gated — it's only meaningful with a real GPU
and a timer query, which is a local-profiling concern, not a CI one.

## Running locally

```bash
# bundled Chromium (matches CI):
npx playwright install chromium
node perf/run.mjs                 # pretty summary + JSON

# or reuse your installed Google Chrome instead of downloading one:
PERF_BROWSER_CHANNEL=chrome node perf/run.mjs result.json
```

Compare two captures (e.g. before/after a change):

```bash
node perf/run.mjs before.json     # stash/checkout the old code first
# ...make changes...
node perf/run.mjs after.json
node perf/compare.mjs before.json after.json
```

`run.mjs` boots Vite itself, so there's no dev server to start. Rendering is
forced onto SwiftShader for cross-machine consistency.

## In CI

`.github/workflows/perf.yml` runs on PRs that touch `src/` or `perf/`. It:

1. benchmarks the **PR head**,
2. swaps `src/` to the **base branch** and benchmarks that,
3. diffs them with `compare.mjs` and posts/updates a single sticky PR comment,
4. **fails** if any structural metric regressed vs base.

### Accepting an intentional change

Sometimes a structural cost is the correct trade (e.g. an extra composite pass
for a correctness fix). The gate is a _signal_, not a wall: add the
**`perf-accept`** label to the PR and the workflow downgrades the failure to a
warning. Once merged, the base moves forward and the metric is the new normal.

## Files

- `harness.html` — sets up the engine + city scene, exposes `window.runPerf({mode})`.
- `run.mjs` — boots Vite, drives the harness in headless Chromium, emits JSON.
- `compare.mjs` — diffs base vs head, prints the Markdown report, gates on structural regressions.
