import { builtinModules } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { encodeGazetteer } from './src/gazetteer-build/binary-codec';

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
      // Encode every bundled gazetteer JSON (~52 MB raw) into the compact
      // binary format from src/gazetteer-build/binary-codec, gzip the result
      // at level 9, and emit at <bundle-dir>/gazetteers/<id>.glb.gz. Total
      // shipped bytes ≈ 5.6 MB (vs 7.3 MB for gzipped JSON). The runtime
      // loader in src/api/place-gazetteers/bundled.ts reads the .glb.gz,
      // gunzips, and calls decodeGazetteer at module init. Source code holds
      // no static .json imports, so no resolveId rewrite is needed.
      // TODO: update .claude/rules/build.md (gzip-JSON paragraph) at the
      // wrap-up of the bundle-and-memory-reduction plan.
      name: 'emit-bundled-gazetteers-binary',
      closeBundle() {
        mkdirSync(gazetteerDestDir, { recursive: true });
        for (const file of readdirSync(gazetteerSrcDir)) {
          if (!file.endsWith('.json')) continue;
          const id = file.slice(0, -'.json'.length);
          const raw = readFileSync(resolve(gazetteerSrcDir, file), 'utf8');
          const json = JSON.parse(raw);
          const bin = encodeGazetteer(json);
          const gz = gzipSync(bin, { level: 9 });
          writeFileSync(resolve(gazetteerDestDir, `${id}.glb.gz`), gz);
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
