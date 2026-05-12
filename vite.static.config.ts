import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// __dirname is not defined in ESM; derive it from import.meta.url so this
// config keeps working after package.json switches to "type": "module".
const __dirname = dirname(fileURLToPath(import.meta.url));

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
