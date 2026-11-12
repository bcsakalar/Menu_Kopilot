import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API_TARGET moves the dev proxy when port 3000 is taken on this machine (README, Sorun giderme).
const api = process.env.API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  // The production CSP allows no data: fonts, and Vite inlines the small font subsets by default.
  build: { assetsInlineLimit: 0 },
  server: {
    port: 5173,
    // The API sets its cookies for the page's own origin, so development goes through the same door as production.
    proxy: { '/api': api, '/health': api },
  },
});
