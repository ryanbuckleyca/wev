import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
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
      '@lineiconshq/react-lineicons': '/Users/ryanbuckley/code/wev/wev-bulletin/test-utils/lineicons-mock.ts',
      '@lineiconshq/free-icons': '/Users/ryanbuckley/code/wev/wev-bulletin/test-utils/lineicons-mock.ts',
    },
  },
})

