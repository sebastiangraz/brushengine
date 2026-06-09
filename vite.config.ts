import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Playground app build. The distributable package uses vite.lib.config.ts and
// owns dist/, so the app build is sent elsewhere to avoid clobbering it.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist-app" },
});
