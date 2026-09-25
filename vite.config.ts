import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Every folder named dayNN-* with an index.html becomes its own page,
// so each tool keeps a clean URL: /30-days-30-tools/day01-xxx/
const root = import.meta.dirname
const toolPages = Object.fromEntries(
  readdirSync(root)
    .filter((d) => /^day\d{2}-/.test(d) && existsSync(resolve(root, d, 'index.html')))
    .map((d) => [d, resolve(root, d, 'index.html')]),
)

export default defineConfig({
  base: '/30-days-30-tools/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    rollupOptions: {
      input: { home: resolve(root, 'index.html'), ...toolPages },
    },
  },
})
