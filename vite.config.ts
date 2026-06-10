import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost', // Ensure it listens on localhost
    strictPort: false, // Allow Vite to find an open port if 5173 is taken
    port: 5173, // Explicitly set the port to 5173
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'],
  },
});
