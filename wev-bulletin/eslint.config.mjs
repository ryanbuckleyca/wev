import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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
    'public/**/*.min.mjs',
    'public/**/*.mjs',
    'public/**/*.js',
  ]),
]);
