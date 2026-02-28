import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { framer } from 'framer-plugin/vite'

export default defineConfig({
  plugins: [react(), framer()],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
