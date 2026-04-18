import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  build: {
    // Forge packager only includes <project_root>/.vite/ in the asar.
    // Without this, outDir resolves relative to root (src/renderer/.vite/...)
    // and the renderer build gets excluded from the package.
    outDir: resolve('.vite/renderer/main_window'),
  },
});
