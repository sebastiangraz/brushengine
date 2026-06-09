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
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "BrushEngine",
      formats: ["es", "cjs"],
      fileName: (format) => `brushengine.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["three"],
      output: { globals: { three: "THREE" } },
    },
  },
});
