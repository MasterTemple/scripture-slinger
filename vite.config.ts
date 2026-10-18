import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// logoxide is linked from a local build, outside this project.
const logoxide = realpathSync(fileURLToPath(new URL('./node_modules/logoxide', import.meta.url)));

export default defineConfig(({ command, isPreview }) => ({
  // Built (and previewed) for GitHub Pages, which serves the game at /scripture-slinger/.
  base: command === 'build' || isPreview ? '/scripture-slinger/' : '/',
  // Pre-bundling would move the package away from the .wasm file it loads beside itself.
  optimizeDeps: { exclude: ['logoxide'] },
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), logoxide] } },
}));
