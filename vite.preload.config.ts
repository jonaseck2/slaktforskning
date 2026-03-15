import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Override the default [name].js to avoid collision with main process index.js
        entryFileNames: 'preload.js',
      },
    },
  },
});
