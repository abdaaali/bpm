import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Mirrors nginx.conf's /api/ext/ -> external-api proxy so `npm run dev`
    // (outside Docker) can reach a locally-running backend stack the same
    // way the production nginx build does. Without this, relative /api/ext
    // calls hit Vite's SPA fallback and get index.html back instead of JSON.
    proxy: {
      '/api/ext': { target: 'http://localhost:3007', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
