import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    allowedHosts: ["xerox-sheep-plug.ngrok-free.dev"],
    hmr: {
      host: "xerox-sheep-plug.ngrok-free.dev",
      protocol: "wss",
      clientPort: 443,
    },
  },
  build: {
    // Keep the output INSIDE the Frontend folder so Vercel can find it
    outDir: 'dist', 
    emptyOutDir: true,
  },
})