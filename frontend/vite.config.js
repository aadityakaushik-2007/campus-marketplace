import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config. The /api proxy forwards requests to the Node backend during
// local dev so the frontend can just call fetch('/api/...') without CORS pain.
// Change the target below if your backend runs on a different port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
