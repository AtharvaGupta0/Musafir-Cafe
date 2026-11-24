import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  // Relative base so the built app works wherever the Worker mounts it
  // (currently /client/) without hard-coding the mount path in asset URLs.
  base: "./",
  publicDir: path.resolve(__dirname, "../public"),
  build: {
    outDir: path.resolve(__dirname, "../../public/client"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../../shared"),
      "@client": path.resolve(__dirname),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
