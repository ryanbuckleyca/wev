import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'lib/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'app/api/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@lineiconshq/react-lineicons': path.resolve(__dirname, 'test-utils/lineicons-mock.ts'),
      '@lineiconshq/free-icons': path.resolve(__dirname, 'test-utils/lineicons-mock.ts'),
    },
  },
});
