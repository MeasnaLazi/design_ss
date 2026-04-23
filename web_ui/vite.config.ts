import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { datasourceApiPlugin } from './vite-plugin-datasource-api'

// https://vite.dev/config/
export default defineConfig({
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
