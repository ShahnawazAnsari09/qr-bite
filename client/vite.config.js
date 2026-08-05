import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies both the REST API and the Socket.io endpoint to the
 * Express server, so the client always talks to its own origin. That keeps a
 * single code path between `npm run dev` and the production build, which the
 * server serves from `client/dist` on the same port.
 *
 * `host: true` binds to every interface — needed for the demo, where a phone
 * on the same Wi-Fi opens the QR link against this machine's LAN address.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4173, host: true },
  build: { outDir: 'dist', sourcemap: false },
});
