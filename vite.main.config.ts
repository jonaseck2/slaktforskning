import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
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
      // Externalize bundled gazetteer JSON (~40 MB) so Vite doesn't parse
      // and bundle them into the main process entry point. Imports are
      // rewritten to ./gazetteers/<file>.json and the actual JSON files
      // are copied into .vite/build/gazetteers/ at build time so they ship
      // inside app.asar alongside index.js.
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
      closeBundle() {
        mkdirSync(gazetteerDestDir, { recursive: true });
        for (const file of readdirSync(gazetteerSrcDir)) {
          if (file.endsWith('.json')) {
            copyFileSync(resolve(gazetteerSrcDir, file), resolve(gazetteerDestDir, file));
          }
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
