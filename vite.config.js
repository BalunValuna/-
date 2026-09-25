import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces a single self-contained HTML file (the game ships as one file).
// The car lab (lab.html) is a dev-only page used by the model critic and is not built.
export default defineConfig(({ command }) => ({
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
    rollupOptions: { input: resolve(import.meta.dirname, 'index.html') },
  },
  plugins: command === 'build' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
}));
