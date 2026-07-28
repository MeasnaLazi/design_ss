import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { editorApiPlugin } from './vite-plugin-editor-api'

// Port 4714 — web_ui keeps 4713 so both editors can run side by side.
const PORT = 4714

export default defineConfig({
  server: {
    port: PORT,
    strictPort: true,
    // The iframe loads strip HTML from this same origin; fs.allow only affects
    // Vite's own /@fs route, which the editor does not use (repo-root assets go
    // through editorApiPlugin instead).
  },
  preview: {
    port: PORT,
    strictPort: true,
  },
  plugins: [react(), tailwindcss(), editorApiPlugin()],
})
