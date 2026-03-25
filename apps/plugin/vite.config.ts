import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import framer from 'vite-plugin-framer'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), framer(), basicSsl()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      // framer and framer-plugin are provided by the Framer runtime — don't bundle them
      external: ['framer', 'framer-plugin'],
    },
  },
  optimizeDeps: {
    // Pre-bundle on first run and cache — eliminates per-request ESM waterfall
    include: ['react', 'react-dom'],
    exclude: ['framer', 'framer-plugin'],
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      overlay: false, // prevent HMR error overlays from blocking the plugin panel
    },
  },
})
