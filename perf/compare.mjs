// Diffs two perf result files (base vs head) and prints a Markdown report for a
// PR comment. HARD-FAILS (exit 1) only on STRUCTURAL regressions — more draw
// calls, triangles, shader programs, or GPU objects than the base. CPU timing is
// reported as a trend and never fails the build (it's noisy and, in CI, measured
// on SwiftShader). See perf/README.md for the rationale.
//
//   node perf/compare.mjs base.json head.json [report.md]
import { readFileSync, writeFileSync } from "node:fs";

const [, , baseFile, headFile, reportFile] = process.argv;
if (!baseFile || !headFile) {
  console.error("usage: node perf/compare.mjs <base.json> <head.json> [report.md]");
  process.exit(2);
}
const base = JSON.parse(readFileSync(baseFile, "utf8"));
const head = JSON.parse(readFileSync(headFile, "utf8"));

const STRUCTURAL = [
  ["drawCalls", "draw calls"],
  ["triangles", "triangles"],
  ["programs", "shader programs"],
  ["geometries", "geometries"],
  ["textures", "textures"],
];
const TIMING_TREND_PCT = 25; // informational flag only; never fails CI

const regressions = [];
let md = `### 🎛️ WebGL render perf\n\n`;
md += `Structural metrics are deterministic and **gate the build**; CPU timing is a SwiftShader trend (informational).\n`;

for (const mode of ["ink", "normal"]) {
  const b = base[mode], h = head[mode];
  md += `\n<details${mode === "ink" ? " open" : ""}><summary><b>${mode}</b> mode</summary>\n\n`;
  md += `| metric | base | head | Δ | |\n|---|--:|--:|--:|:--|\n`;

  for (const [key, label] of STRUCTURAL) {
    const bv = b.structural[key], hv = h.structural[key];
    const d = hv - bv;
    let mark = "✅";
    if (d > 0) { mark = "⚠️ **regression**"; regressions.push(`${mode}.${label}: ${bv} → ${hv}`); }
    else if (d < 0) mark = "🎉 improved";
    md += `| ${label} | ${bv} | ${hv} | ${d >= 0 ? "+" : ""}${d} | ${mark} |\n`;
  }

  for (const [key, label] of [["cpuMsPerFrameMin", "CPU ms/frame (min)"], ["cpuMsPerFrameMedian", "CPU ms/frame (median)"]]) {
    const bv = b[key], hv = h[key];
    const pct = bv > 0 ? ((hv - bv) / bv) * 100 : 0;
    const mark = pct > TIMING_TREND_PCT ? `📈 +${pct.toFixed(0)}%` : pct < -TIMING_TREND_PCT ? `📉 ${pct.toFixed(0)}%` : "·";
    md += `| ${label} | ${bv} | ${hv} | ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% | ${mark} |\n`;
  }
  md += `\n</details>\n`;
}

md += `\n`;
md += regressions.length
  ? `> ❌ **${regressions.length} structural regression(s):**\n` + regressions.map((r) => `> - ${r}`).join("\n") + `\n`
  : `> ✅ No structural regressions.\n`;
md += `\n<sub>scene: ${head.ink.strokes} strokes · 1280×720 · software GL · base→head</sub>\n`;
md += `<!-- brushengine-perf -->\n`; // marker for the sticky-comment upsert

if (reportFile) writeFileSync(reportFile, md);
process.stdout.write(md);

if (regressions.length) {
  console.error(`\nFAIL: ${regressions.length} structural regression(s).`);
  process.exit(1);
}
console.error("\nOK: no structural regressions.");
