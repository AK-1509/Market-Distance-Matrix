/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build --mode artifact` builds the Claude Artifact version: relative
// asset paths, one inlined JS chunk (lazy chunks folded in) and the layout
// worker as a sibling file. scripts/assemble-artifact.mjs then inlines the
// page for publishing.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'artifact' ? './' : '/',
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build:
    mode === 'artifact'
      ? {
          outDir: 'dist-artifact',
          emptyOutDir: true,
          modulePreload: false,
          chunkSizeWarningLimit: 1500,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : undefined,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
