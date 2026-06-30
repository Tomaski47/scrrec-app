import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: false,
    port: 5174,
    allowedHosts: ['tomass-macbook-pro.tail6f3ab4.ts.net'],
  },
});
