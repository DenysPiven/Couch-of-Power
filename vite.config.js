import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Couch-of-Power/',
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
