// Builds each MCP App view as one self-contained HTML document.
//
// MCP App views run under a default CSP of `default-src 'none'` with
// `connect-src 'none'`, so every script, style, and asset must be inlined.
// Entries are built one at a time so the inline status card does not carry the
// board bundle. Vite's JS API is used rather than an env-var-selected config so
// entry selection stays cross-platform without a shell helper dependency.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(root, 'src/mcp-app/client');
const outDir = path.join(root, 'skills/project-manager/mcp-app');

for (const entry of ['status.html', 'board.html']) {
  await build({
    configFile: false,
    root: clientRoot,
    base: './',
    plugins: [react(), viteSingleFile()],
    logLevel: 'info',
    build: {
      outDir,
      // Entries are built sequentially into one directory, so neither may clear it.
      emptyOutDir: false,
      rollupOptions: { input: path.join(clientRoot, entry) },
    },
  });
}
