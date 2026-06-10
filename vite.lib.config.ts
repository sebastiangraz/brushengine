import { defineConfig } from "vite";
import { resolve } from "node:path";

// Library build (the distributable package). The playground app uses the
// separate vite.config.ts. `three` is a peer dependency and stays external so
// consumers dedupe a single copy.
export default defineConfig({
  // Brushes are inlined (brushData.ts); don't copy public/ into the package.
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      // Multi-entry: the main barrel keeps emitting brushengine.js/.cjs, and the
      // renderer-free scene entry emits scene.js/.cjs. No UMD `name` — a single
      // global is invalid with multiple entries, and es+cjs don't need one.
      entry: {
        brushengine: resolve(__dirname, "src/lib/index.ts"),
        scene: resolve(__dirname, "src/lib/scene.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["three"],
      output: { globals: { three: "THREE" } },
    },
  },
});
