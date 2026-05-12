// Vite config that builds src/renderer/ for the Tauri webview.
// Differences vs vite.renderer.config.ts (which is owned by electron-forge):
//   - Output goes to dist-tauri/ (where tauri.conf.json's frontendDist
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
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    vue(),
    // Several src/api/ modules import from node:fs / node:path / node:url /
    // node:zlib (media path math, gazetteer gunzip, duplicate file probes).
    // The renderer can't actually read disk; these polyfills let the bundle
    // *build*, and any code path that calls fs at runtime fails loudly. Real
    // file I/O moves to Rust commands in a follow-up phase.
    nodePolyfills({
      protocolImports: true,
      // Exclude fs and fs/promises — we alias them ourselves. The polyfill
      // makes fs/promises resolve as a subpath of the fs stub which doesn't
      // exist on disk.
      exclude: ['fs', 'fs/promises', 'node:fs', 'node:fs/promises'],
    }),
  ],
  root: 'src/renderer',
  build: {
    outDir: resolve('dist-tauri'),
    emptyOutDir: true,
    // Tauri targets modern WebKit (macOS) / WebView2 / WebKitGTK; top-level
    // await + dynamic imports are fine.
    target: 'esnext',
    // Keep readable stacks in the spike — we're debugging.
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: [
      // Exact-match regex aliases to avoid prefix collisions with the
      // node-polyfills plugin's internal aliases.
      { find: /^node-sqlite3-wasm$/, replacement: resolve('src/renderer/db-shim.ts') },
      { find: /^(node:)?fs$/, replacement: resolve('src/renderer/empty-stub.ts') },
      { find: /^(node:)?fs\/promises$/, replacement: resolve('src/renderer/empty-fs-promises.ts') },
      { find: /^(node:)?worker_threads$/, replacement: resolve('src/renderer/empty-stub.ts') },
      { find: /^(node:)?child_process$/, replacement: resolve('src/renderer/empty-stub.ts') },
      // Match the bundled.ts gazetteer loader by absolute path —
      // fileURLToPath(import.meta.url) throws on tauri:// origin.
      { find: /^.*\/place-gazetteers\/bundled(\.ts)?$/, replacement: resolve('src/renderer/empty-gazetteers.ts') },
      // Genney importer touches __dirname + spawn at module init — node-only.
      // Stubbed for the spike; real importers move to Rust commands.
      { find: /^.*\/import\/genney\/index(\.ts)?$/, replacement: resolve('src/renderer/empty-genney.ts') },
    ],
  },
  server: {
    // Match what tauri.conf.json's devUrl expects.
    port: 1420,
    strictPort: true,
  },
});
