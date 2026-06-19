import { defineConfig } from 'vite';

// Relative base so the build works both at a domain root (custom domain)
// and under a GitHub Pages project path (https://user.github.io/deadstill/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
