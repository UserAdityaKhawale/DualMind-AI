import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiOrigin = process.env.API_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: apiOrigin, changeOrigin: true } },
  },
});
