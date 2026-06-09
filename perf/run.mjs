// Boots Vite programmatically, drives perf/harness.html in headless Chromium,
// and emits render metrics as JSON. Self-contained: `node perf/run.mjs` needs
// no separately-running dev server.
//
//   node perf/run.mjs            -> pretty table to stderr, JSON to stdout
//   node perf/run.mjs out.json   -> also writes JSON to out.json
//
// CI runs WebGL on SwiftShader (no GPU), so absolute timings are relative, not
// hardware-truth. The structural metrics are deterministic and are what we gate
// on; CPU timing is reported as a trend. See perf/README.md.
import { createServer } from "vite";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const outFile = process.argv[2];

// Force software rendering so results are consistent across machines/CI.
const args = [
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--no-sandbox",
];
// Locally we may not have Playwright's bundled chromium; allow the system Chrome
// via PERF_BROWSER_CHANNEL=chrome. In CI we install bundled chromium (no channel).
const channel = process.env.PERF_BROWSER_CHANNEL || undefined;

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: 0 },
  logLevel: "warn",
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");

const browser = await chromium.launch({ channel, headless: true, args });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// Optional overrides for tighter local numbers; CI uses the harness defaults.
const opts = {};
if (process.env.PERF_ITERS) opts.iters = +process.env.PERF_ITERS;
if (process.env.PERF_TRIALS) opts.trials = +process.env.PERF_TRIALS;

let result;
try {
  // 'domcontentloaded' + the __ready flag is faster and more robust than
  // 'networkidle' (Vite's HMR socket can keep the network from ever idling).
  await page.goto(`${base}/perf/harness.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__ready === true", null, { timeout: 60000 });
  const ink = await page.evaluate((o) => window.runPerf({ mode: "ink", ...o }), opts);
  const normal = await page.evaluate((o) => window.runPerf({ mode: "normal", ...o }), opts);
  result = { runner: { swiftshader: true }, ink, normal };
} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  console.error("PAGE ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}

const json = JSON.stringify(result, null, 2);
if (outFile) writeFileSync(outFile, json);
console.error(
  [result.ink, result.normal]
    .map(
      (r) =>
        `${r.mode.padEnd(6)} drawCalls=${r.structural.drawCalls} tris=${r.structural.triangles} ` +
        `programs=${r.structural.programs} cpuMin=${r.cpuMsPerFrameMin}ms`,
    )
    .join("\n"),
);
console.log(json);
