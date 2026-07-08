import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175, // was 5174, colliding with contractor-portal's dev port
    // Mirrors nginx.conf's proxy routes so `npm run dev` (outside Docker) can
    // reach a locally-running backend stack. Without this, relative
    // /api/v1, /api/ext, /kc calls hit Vite's SPA fallback (index.html) instead.
    proxy: {
      '/api/v1': { target: 'http://localhost:3000', changeOrigin: true },
      '/api/ext': { target: 'http://localhost:3007', changeOrigin: true },
      '/kc': { target: 'http://localhost:8443', changeOrigin: true, rewrite: (path) => path.replace(/^\/kc/, '') },
    },
  },
});
