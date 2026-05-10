// Vite config that builds src/renderer/ for the Tauri spike's webview.
// Differences vs vite.renderer.config.ts (which is owned by electron-forge):
//   - Output goes to tauri-spike/dist (where tauri.conf.json's frontendDist
//     points by default).
//   - `node-sqlite3-wasm` is aliased to src/renderer/db-shim.ts so api/db.ts
//     routes its db.prepare/run/get/all calls through Tauri invoke() to the
//     rusqlite primitives in src-tauri/src/db.rs.
//   - electron-forge-specific knobs are absent.
//
// Run: npx vite build --config vite.tauri-renderer.config.ts
//   or: npx vite --config vite.tauri-renderer.config.ts (dev server, used by
//       Tauri's beforeDevCommand).

import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  build: {
    outDir: resolve('tauri-spike/dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // Renderer-side shim that fakes the node-sqlite3-wasm Database surface
      // and routes through invoke() to rusqlite. See src/renderer/db-shim.ts.
      'node-sqlite3-wasm': resolve('src/renderer/db-shim.ts'),
    },
  },
  server: {
    // Match what tauri.conf.json's devUrl expects.
    port: 1420,
    strictPort: true,
  },
});
