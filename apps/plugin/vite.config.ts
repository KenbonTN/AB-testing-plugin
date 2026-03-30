import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import framer from 'vite-plugin-framer'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  return {
    plugins: [react(), framer(), mkcert()],
    resolve: isDev ? { alias: { framer: path.resolve('./src/framer-mock.ts') } } : {},
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
  }
})
