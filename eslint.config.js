import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { importBoundary } from './eslint-rules/import-boundary.js';

export default defineConfig(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
    ],
  },

  // Recommended JavaScript and TypeScript rules, including the ones that use type information.
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Config files written in plain JavaScript are not part of the TypeScript project.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // The import boundary between src/server, src/web and src/shared.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { local: { rules: { 'import-boundary': importBoundary } } },
    rules: { 'local/import-boundary': 'error' },
  },
);
