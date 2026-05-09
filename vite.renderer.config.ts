import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// rollup-plugin-visualizer is ESM-only; the Forge Vite plugin loads this
// config through esbuild's CJS path, so a top-level static import would
// fail with "this package is ESM only". Resolve it via dynamic import,
// gated on VISUALIZE=1 so it has zero cost on normal builds.
export default defineConfig(async () => {
  const plugins: Array<unknown> = [vue()];
  if (process.env.VISUALIZE === '1') {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(
      visualizer({
        filename: '.vite/renderer-bundle-visualizer.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }),
    );
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: plugins as any,
    root: 'src/renderer',
    build: {
      // Forge packager only includes <project_root>/.vite/ in the asar.
      // Without this, outDir resolves relative to root (src/renderer/.vite/...)
      // and the renderer build gets excluded from the package.
      outDir: resolve('.vite/renderer/main_window'),
    },
  };
});
