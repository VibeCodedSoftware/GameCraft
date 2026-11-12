import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { craftApi } from '../Shared/devserver/projectApi';

const here = __dirname;

/**
 * Lists the built files the standalone game player needs (export-files.json): everything except the editor's
 * own page and entry code. "Export game" copies these next to the exported game.
 */
function playerFiles() {
  return {
    name: 'craft-player-files',
    generateBundle(_opts: any, bundle: Record<string, any>) {
      const editorOnly = new Set<string>(['index.html']);
      for (const [file, c] of Object.entries(bundle)) if (c.type === 'chunk' && c.isEntry && c.name === 'index') editorOnly.add(file);
      const files = Object.keys(bundle).filter((f) => !editorOnly.has(f));
      (this as any).emitFile({ type: 'asset', fileName: 'export-files.json', source: JSON.stringify(files) });
    },
  };
}
const app = path.resolve(here, '..');

export default defineConfig({
  plugins: [
    react(),
    playerFiles(),
    craftApi({
      app: 'gamecraft',
      projectsDir: path.join(here, 'projects'),
      exchangeDir: path.join(app, 'Shared', 'exchange'),
      libraryDirs: [
        { id: 'models', dir: path.join(here, 'Assets'), label: 'Your models (GameCraft/Assets)' },
        { id: 'library', dir: path.join(here, 'asset-library'), label: 'Asset library (GameCraft/asset-library)' },
        { id: 'runtime', dir: path.join(app, 'Windows', 'GameCraft', 'runtime'), label: 'Game player' },
      ],
      extensionsDir: path.join(here, 'extensions'),
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.join(app, 'Shared'),
      // Shared/ui imports React; resolve it from this app so there is exactly one copy.
      react: path.join(here, 'node_modules/react'),
      'react-dom': path.join(here, 'node_modules/react-dom'),
    },
  },
  // Projects aren't source. Watching them held their subfolders open on Windows, so Remove failed with EPERM.
  server: { fs: { allow: [app] }, port: 5173, watch: { ignored: ['**/projects/**'] } },
  // Pre-bundled up front so the dev server does not reload the page when the LOD worker first needs it.
  optimizeDeps: { include: ['three/examples/jsm/modifiers/SimplifyModifier.js', 'three-bvh-csg', 'three-mesh-bvh'] },
  // Relative URLs so the built game player works from any folder (exported games, CraftPlayer, web hosts).
  base: './',
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { index: path.join(here, 'index.html'), player: path.join(here, 'player.html') } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
