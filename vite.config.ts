import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ux": path.resolve(__dirname, "./src/ux"),
      "@uses": path.resolve(__dirname, "./src/uses"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Same-origin development bridge: it carries the CV server session cookie
    // without weakening the server's CORS policy.
    proxy: {
      "/cv-server": {
        target: process.env.CV_SERVER_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/cv-server/, ""),
      },
    },
  },
}));
