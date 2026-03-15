import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'node-sqlite3-wasm',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
  resolve: {
    conditions: ['node'],
  },
});
