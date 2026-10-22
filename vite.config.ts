import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildRevision = process.env.BUILD_REVISION || process.env.GITHUB_SHA || 'local';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'release-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, revision: buildRevision }) + '\n' });
      for (const name of readdirSync(new URL('./experiments/licenses/', import.meta.url))) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: readFileSync(new URL(`./experiments/licenses/${name}`, import.meta.url), 'utf8') });
      }
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(version), 'import.meta.env.VITE_BUILD_REVISION': JSON.stringify(buildRevision) },
  build: { assetsInlineLimit: 0 },
  worker: {
    format: 'es',
    // nginx serves .js consistently as JavaScript; not every host maps .mjs.
    rollupOptions: { output: { assetFileNames: asset => asset.names.some(name => name.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]' } },
  },
  // The lab page is excluded from the normal production build.
  ...(mode === 'experiments' ? {
    build: { outDir: 'output/transcription-lab', assetsInlineLimit: 0, rollupOptions: { input: ['index.html', 'experiments/transcription.html'] } },
  } : {}),
  server: {
    host: '127.0.0.1',
    strictPort: false,
    port: 5174,
  },
}));
