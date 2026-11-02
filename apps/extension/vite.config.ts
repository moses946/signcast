import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
export default defineConfig({
  base: './',
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [react(), ...(process.env.SIGNCAST_LOCAL_HTTPS === 'true' ? [basicSsl()] : [])],
  server: {
    proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(import.meta.dirname, 'viewer.html'),
        config: resolve(import.meta.dirname, 'config.html'),
        live: resolve(import.meta.dirname, 'live.html'),
      },
    },
  },
});
