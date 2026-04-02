import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/api/**/*.ts'],
      exclude: ['src/api/types.ts', 'src/api/schema.ts'],
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
          environment: 'node',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
});
