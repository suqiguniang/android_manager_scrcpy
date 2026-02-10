import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path"
import fs from "fs"

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(),],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    /* scrcpy */
    server: {
        https: fs.existsSync(path.resolve(__dirname, './certs/key.pem')) ? {
            key: fs.readFileSync(path.resolve(__dirname, './certs/key.pem')),
            cert: fs.readFileSync(path.resolve(__dirname, './certs/cert.pem')),
        } : undefined,
        fs: {
            allow: ["../.."],
        },
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
        proxy: {
            '/api': {
                target: 'https://192.168.50.226:8080',
                changeOrigin: true,
                secure: false,
                ws: true,
            },
        },
    },
    optimizeDeps: {
        exclude: [
            "@yume-chan/scrcpy-decoder-tinyh264",
            "@yume-chan/pcm-player",
        ],
        include: [
            "@yume-chan/scrcpy-decoder-tinyh264 > yuv-buffer",
            "@yume-chan/scrcpy-decoder-tinyh264 > yuv-canvas",
        ],
    },
    worker: {
        format: 'es',
    },
})
