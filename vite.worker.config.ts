import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { defineConfig } from 'vite';

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
      // Same gazetteer externalization as vite.main.config.ts — the worker imports
      // api/checks which transitively imports place-gazetteers/bundled. Must emit
      // './gazetteers/<file>.json' so the resolved module path sits alongside
      // db-worker.js inside app.asar at runtime. vite.main.config.ts owns the
      // closeBundle that actually copies the JSON into .vite/build/gazetteers/.
      name: 'externalize-gazetteers',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source.endsWith('.json') && importer) {
          const isGaz = /place-gazetteers\/data\//.test(source) ||
            (importer.includes('place-gazetteers') && source.startsWith('./data/'));
          if (isGaz) {
            return { id: './gazetteers/' + basename(source), external: true };
          }
        }
        return null;
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
