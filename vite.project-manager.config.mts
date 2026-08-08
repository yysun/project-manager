/** Project Manager Studio client build: source root and packaged skill output. */
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/project-manager-studio/client'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, 'skills/project-manager/studio/dist'),
    emptyOutDir: true,
  },
});
