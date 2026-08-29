/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Keep production assets portable: GitHub Pages serves this project below
  // /legal-crime/, while local and downloaded review builds use other roots.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
