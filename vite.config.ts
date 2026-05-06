import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/gui'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/gui'],
        },
      },
    },
  },
  server: {
    host: true,   // ← exposes on LAN so Android Chrome can connect
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
