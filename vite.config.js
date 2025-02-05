import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.png'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || 
                id.includes('scheduler') || 
                id.includes('@remix-run') ||
                id.includes('react-dom')) {
              return 'react-vendor'
            }
            if (id.includes('bootstrap') || 
                id.includes('@popperjs')) {
              return 'bootstrap-vendor'
            }
            return 'vendor'
          }
          // App specific chunks
          if (id.includes('word-list')) {
            return 'wordlist'
          }
          if (id.includes('SeedGenerator')) {
            return 'seed-generator'
          }
        }
      }
    },
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    target: 'esnext'
  }
});