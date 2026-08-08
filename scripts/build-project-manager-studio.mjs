// Bundles the Project Manager Studio server and its dependencies into the
// installed skill so launch requires only plain Node.js.
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await esbuild.build({
  entryPoints: [path.join(root, 'src/project-manager-studio/server/cli.ts')],
  outfile: path.join(root, 'skills/project-manager/scripts/project-manager-studio.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
