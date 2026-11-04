import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The production CSP allows no data: fonts, and Vite inlines the small font subsets by default.
  build: { assetsInlineLimit: 0 },
  server: {
    port: 5173,
    // The API sets its cookies for the page's own origin, so development goes through the same door as production.
    proxy: { '/api': 'http://127.0.0.1:3000', '/health': 'http://127.0.0.1:3000' },
  },
});
