import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: 'wev-bulletin/',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.cjs'],
    rules: {
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-expressions': 'off', // Disable to prevent crashing in this environment
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['next.config.mjs'],
  },
  globalIgnores([
    'next.config.mjs',
    'eslint.config.mjs',
    '.next/**',
    'out/**',
    'build/**',
    'playwright-report/**',
    'e2e/.output/**',
    'e2e/results/**',
    'next-env.d.ts',
    'scripts/**/*.js',
    'supabase/**/*.js',
    'tailwind.config.js',
  ]),
]);
