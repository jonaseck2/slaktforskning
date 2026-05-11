import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  test: {
    // runAllChecks builds nameIndexCache against 27 bundled gazetteers on the
    // first call per Vitest worker process — under suite-wide parallel load
    // this can spike past the default 5s. Bump to 15s for the cold builds.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: [
        'src/api/**/*.ts',
        'src/gazetteer-build/**/*.ts',
        'src/gedcom/**/*.ts',
        'src/import/**/*.ts',
        'src/mcp/**/*.ts',
        'src/renderer/utils/**/*.ts',
        'src/renderer/composables/**/*.ts',
        // Tauri-bridge layer — without this, polyfill drift was silent.
        // Coverage is driven by tests/unit/tauri-window-api.test.ts +
        // tests/unit/db-shim.test.ts. Threshold is the global 80% line.
        'src/renderer/tauri-window-api.ts',
        'src/renderer/db-shim.ts',
        'src/shared/**/*.ts',
      ],
      exclude: [
        // Type-only files (no runtime code)
        'src/api/types.ts',
        'src/api/schema.ts',
        'src/api/place-gazetteers/types.ts',
        'src/import/gedcom/import-types.ts',
        'src/mcp/tools/prod/types.ts',
        'src/renderer/utils/chart-layout/types.ts',

        // Entry points / wiring (need Electron runtime)
        'src/mcp/server.ts',
        'src/mcp/devServer.ts',
        'src/mcp/createDevServer.ts',
        'src/mcp/index.ts',
        'src/gedcom/index.ts',
        'src/gedcom/importer.ts',
        'src/import/gedcom/index.ts',
        'src/import/gedcom/parser.ts',
        'src/gazetteer-build/index.ts',
        'src/gazetteer-build/io.ts',
        'src/gazetteer-build/sparql.ts',
        'src/renderer/utils/chart-layout/index.ts',

        // MCP dev tools (need running Electron app)
        'src/mcp/tools/dev/chart.ts',
        'src/mcp/tools/dev/inspect.ts',
        'src/mcp/tools/dev/ui.ts',

        // Composables that need full DOM/Electron/window.api
        'src/renderer/composables/useChartBridge.ts',
        'src/renderer/composables/useChartNavigation.ts',
        'src/renderer/composables/usePersonPanelData.ts',
        'src/renderer/composables/usePlacePanelSections.ts',
        'src/renderer/composables/usePlaceResolver.ts',
        'src/renderer/composables/useScreenReaderMode.ts',
        'src/renderer/composables/useSectionState.ts',
        'src/renderer/composables/useTextareaHeight.ts',
        'src/renderer/composables/useToast.ts',

        // Renderer data processing (needs window.api)
        'src/renderer/utils/chartData.ts',

        // Canvas/DOM crop helper — loadImage and cropImageToDataUrl require
        // HTMLImageElement and HTMLCanvasElement which are not available in the
        // Vitest node environment. The pure computeSquareCropRectPx export is
        // exercised in tests/unit/cropImage.test.ts but cannot contribute
        // enough covered lines to reach the 80% threshold on the file.
        'src/renderer/utils/cropImage.ts',

        // Per-channel defineChannel() wrappers run in the IPC worker thread, not
        // in unit tests. Parity between channel registry and preload is enforced
        // by tests/unit/registry.test.ts and tests/unit/preload-coverage.test.ts.
        'src/shared/channels/**',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['tests/unit/components/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./tests/unit/vitestSetup.ts'],
          // Project-level test config does not inherit testTimeout from the
          // parent. Windows runners hit the 5s default on slow spawns
          // (isDockerAvailable, switch_database opening a new sqlite file).
          testTimeout: 15000,
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'components',
          include: [
            'tests/components/**/*.test.ts',
            'tests/unit/components/**/*.test.ts',
          ],
          environment: 'happy-dom',
          setupFiles: ['./tests/components/vitestSetup.ts'],
          testTimeout: 15000,
        },
      },
    ],
  },
});
