import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          vendor: ['react', 'react-dom', 'react-hot-toast', 'date-fns'],
        }
      }
    },
    target: 'es2017', // Suporte a celulares mais antigos
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true }
    }
  }
})
