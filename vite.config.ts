import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost', // Ensure it listens on localhost
    strictPort: false, // Allow Vite to find an open port if 5175 is taken
    port: 5175, // Explicitly set the port to 5175
  },
  optimizeDeps: {
    exclude: ['lucide-react', '@ffmpeg/ffmpeg'],
  },
});
