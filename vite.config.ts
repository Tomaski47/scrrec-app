import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    strictPort: true,
    port: 5173,
    allowedHosts: ['tomass-macbook-pro.tail6f3ab4.ts.net'],
  },
});
