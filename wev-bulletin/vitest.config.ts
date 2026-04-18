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
    testTimeout: 15000,
    include: ['**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
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
