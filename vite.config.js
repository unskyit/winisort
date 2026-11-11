import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
  // Supports both root domain ('/') and GitHub Pages repository subpath ('./' or process.env.BASE_PATH)
  const base = process.env.BASE_PATH || './';
  return {
    base,
    publicDir: 'public',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    },
    server: {
      port: 5173,
      strictPort: false,
      open: false
    },
    preview: {
      port: 4173
    }
  };
});
