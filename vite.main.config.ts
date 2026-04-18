import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { defineConfig } from 'vite';

const outputDir = resolve('.vite/build');

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
      // and bundle them into the main process entry point. The JSON files
      // are loaded at runtime via Node.js require() instead. The resolveId
      // hook rewrites the import path to be relative to the output directory
      // so require() finds the original source files.
      name: 'externalize-gazetteers',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source.endsWith('.json') && importer) {
          const isGaz = /place-gazetteers\/data\//.test(source) ||
            (importer.includes('place-gazetteers') && source.startsWith('./data/'));
          if (isGaz) {
            const importerDir = resolve(importer, '..');
            const absJson = resolve(importerDir, source);
            let rel = relative(outputDir, absJson);
            if (!rel.startsWith('.')) rel = './' + rel;
            return { id: rel, external: true };
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
