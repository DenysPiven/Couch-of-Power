import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Four-on-the-Couch/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sim: resolve(__dirname, 'sim.html'),
        stats: resolve(__dirname, 'stats.html'),
      },
    },
  },
});
