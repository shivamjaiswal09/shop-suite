import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Workspace packages export raw TS from src/ — let Vite compile them, don't prebundle.
  optimizeDeps: {
    exclude: ['@shop/core', '@shop/data', '@shop/state', '@shop/tokens'],
  },
  server: {
    // Not Vite's default 5173: another local app on this machine has a service
    // worker registered on that origin, which intercepts navigation and serves
    // its own cached shell instead of this app.
    port: 5273,
    strictPort: true,
    // Default binding resolved to [::1] only on this machine, which Chrome
    // could not reach via `localhost`. Binding all interfaces keeps both IPv4
    // and IPv6 working (and lets a phone open it for the mobile comparison).
    host: true,
  },
});
