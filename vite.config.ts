/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom'], storage: ['dexie', 'zod'] },
      },
    },
  },
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
