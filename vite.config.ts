import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  lint: {
    plugins: ['typescript', 'react', 'jsx-a11y', 'import'],
    categories: { correctness: 'error' },
    env: { browser: true, node: true, es2024: true },
    ignorePatterns: ['dist/**', 'node_modules/**', '.data/**', '.vite-plus/**'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'typescript/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'import/no-duplicates': 'error',
      'react/jsx-key': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  fmt: {
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    endOfLine: 'lf',
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.data/**',
      '.vite-plus/**',
      'package-lock.json',
    ],
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
