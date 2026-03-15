import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'better-sqlite3',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
  resolve: {
    // Ensure better-sqlite3 bindings can resolve
    conditions: ['node'],
  },
});
