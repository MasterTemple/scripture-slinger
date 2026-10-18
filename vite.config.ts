import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // Built (and previewed) for GitHub Pages, which serves the game at /scripture-slinger/.
  base: command === 'build' || isPreview ? '/scripture-slinger/' : '/',
  // Pre-bundling would move the package away from the .wasm file it loads beside itself.
  optimizeDeps: { exclude: ['logoxide'] },
}));
