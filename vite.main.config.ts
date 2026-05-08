import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const gazetteerSrcDir = resolve('src/api/place-gazetteers/data');
const gazetteerDestDir = resolve('.vite/build/gazetteers');

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
      // Gzip every bundled gazetteer JSON (~52 MB raw → ~6 MB) and emit them
      // at <bundle-dir>/gazetteers/<id>.json.gz. src/api/place-gazetteers/
      // bundled.ts loads them via gunzipSync at module init. Source code holds
      // no static .json imports, so no resolveId rewrite is needed.
      name: 'compress-bundled-gazetteers',
      closeBundle() {
        mkdirSync(gazetteerDestDir, { recursive: true });
        for (const file of readdirSync(gazetteerSrcDir)) {
          if (!file.endsWith('.json')) continue;
          const raw = readFileSync(resolve(gazetteerSrcDir, file));
          const gz = gzipSync(raw, { level: 9 });
          writeFileSync(resolve(gazetteerDestDir, `${file}.gz`), gz);
        }
      },
    },
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
