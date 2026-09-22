import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildRevision = process.env.BUILD_REVISION || process.env.GITHUB_SHA || 'local';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'release-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, revision: buildRevision }) + '\n' });
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    host: '127.0.0.1',
    strictPort: false,
    port: 5174,
  },
});
