import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // The SPA and the API stay same-origin in dev, so the session cookie just works.
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
