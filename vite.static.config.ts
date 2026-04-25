import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  root: 'src/static',
  build: {
    outDir: resolve(__dirname, 'dist-static'),
    emptyOutDir: true,
    target: 'es2022',
  },
  define: {
    'import.meta.env.VITE_STATIC_MODE': JSON.stringify('true'),
  },
  server: {
    port: 5174,
  },
});
