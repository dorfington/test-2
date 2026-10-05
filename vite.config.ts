/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works at any URL path (e.g. GitHub Pages' /<repo>/).
  base: './',
  plugins: [react(), tailwindcss()],
  // The main chunk carries the validated tax tables for every year (~half its size).
  build: { chunkSizeWarningLimit: 600 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
