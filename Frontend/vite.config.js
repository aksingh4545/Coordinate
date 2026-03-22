import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep the output INSIDE the Frontend folder so Vercel can find it
    outDir: 'dist', 
    emptyOutDir: true,
  },
})