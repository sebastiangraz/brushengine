// Build-time guard: the renderer-free scene entry must never leak the WebGL
// renderer or any DOM/three reference. Run after build:lib (and in
// prepublishOnly) so the scene bundle can never silently regress into pulling
// `three`, BrushEngine, or `document` back in.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, "..", "dist");

const targets = ["scene.js", "scene.cjs"];
const forbidden = /\b(three|BrushEngine|document|window|WebGL)\b/;

let failed = false;
for (const file of targets) {
  const path = resolve(dist, file);
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    console.error(`✗ ${file}: missing — run "npm run build:lib" first.`);
    failed = true;
    continue;
  }
  const hits = src
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => forbidden.test(line));
  if (hits.length) {
    failed = true;
    console.error(`✗ ${file}: renderer/DOM reference leaked into scene entry:`);
    for (const { line, n } of hits.slice(0, 10)) {
      console.error(`    ${n}: ${line.trim()}`);
    }
  } else {
    console.log(`✓ ${file}: renderer-free.`);
  }
}

if (failed) process.exit(1);
console.log("scene entry is renderer-free ✓");
