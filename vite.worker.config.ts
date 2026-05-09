import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The DB worker imports api/checks → place-gazetteers/bundled, but that file
// no longer holds static .json imports — gazetteers are loaded at module init
// via gunzipSync(readFileSync(...)) against `<bundle-dir>/gazetteers/*.json.gz`.
// vite.main.config.ts owns the closeBundle hook that emits those gz files; the
// worker bundle just emits db-worker.js into the same .vite/build/ dir, so
// `import.meta.url` inside bundled.ts resolves to that shared dir at runtime.
// No gazetteer plugin needed here.
export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
  plugins: [
    {
      name: 'copy-sqlite3-wasm',
      closeBundle() {
        const src = resolve('node_modules/node-sqlite3-wasm/dist/node-sqlite3-wasm.wasm');
        const dest = resolve('.vite/build/node-sqlite3-wasm.wasm');
        mkdirSync(resolve('.vite/build'), { recursive: true });
        copyFileSync(src, dest);
      },
    },
  ],
  resolve: {
    conditions: ['node'],
  },
});
