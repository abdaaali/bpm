import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mirrors nginx.conf's /api/ -> api-gateway proxy so `npm run dev` (outside
    // Docker) can reach a locally-running backend stack. Must target
    // localhost, not the Docker-internal "api-gateway" hostname — that only
    // resolves for containers on the bpm-net network, not the host machine
    // running the Vite dev server. (contractor-portal's and mobile-pwa's
    // vite.config.ts already use this same localhost pattern; this file had
    // drifted from it.)
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
