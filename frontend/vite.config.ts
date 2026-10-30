import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @/ is src/, so an import says where a file lives, not how far away it is
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
