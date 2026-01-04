import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: './',
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks: {
                    'phosphor-icons': ['@phosphor-icons/react']
                }
            }
        }
    },
    server: {
        proxy: {
            '/api': 'http://localhost:8099'
        }
    }
});
