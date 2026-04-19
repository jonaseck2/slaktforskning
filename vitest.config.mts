import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  test: {
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
        'src/renderer/composables/useChartZoom.ts',
        'src/renderer/composables/usePersonPanelData.ts',
        'src/renderer/composables/usePlacePanelSections.ts',
        'src/renderer/composables/usePlaceResolver.ts',
        'src/renderer/composables/useScreenReaderMode.ts',
        'src/renderer/composables/useSectionState.ts',
        'src/renderer/composables/useTextareaHeight.ts',
        'src/renderer/composables/useToast.ts',

        // Renderer data processing (needs window.api)
        'src/renderer/utils/chartData.ts',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['tests/unit/components/**/*.test.ts'],
          environment: 'node',
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
        },
      },
    ],
  },
});
