import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  root: 'src/static',
  base: './',
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
