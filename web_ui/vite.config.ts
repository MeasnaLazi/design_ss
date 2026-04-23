import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { datasourceApiPlugin } from './vite-plugin-datasource-api'

// https://vite.dev/config/
export default defineConfig({
    build: {
        // OpenCV wasm bundle is ~11 MB minified; default 500 kB warning is not actionable here.
        chunkSizeWarningLimit: 13000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return
                    if (id.includes('fabric')) return 'fabric'
                    if (id.includes('lucide-react')) return 'lucide'
                    if (id.includes('react-dom') || id.includes('/react/')) return 'react'
                },
            },
        },
    },
    server: {
        port: 4713,
    },
    preview: {
        port: 4713,
        strictPort: true,
    },
    plugins: [
        react(),
        tailwindcss(),
        datasourceApiPlugin(),
    ],
})
