import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // bind 0.0.0.0 so the dev server is reachable from outside the container
    port: 5173,
    // Optional dev proxy so you can call the Django API at a relative path
    // and avoid CORS during development. Enable by setting VITE_API_URL=/api
    // and pointing this at your Django dev server.
    proxy: {
      '/api': {
        // Local dev hits the Django dev server on localhost; inside docker
        // compose the API is reached via its service name (VITE_PROXY_TARGET
        // is set to http://app:8000 in docker-compose.yml).
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
