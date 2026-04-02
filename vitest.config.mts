import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  test: {
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
