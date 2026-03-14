import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import httpProxy from 'http-proxy';

// Create a proxy instance for MediaMTX
const mtxProxy = httpProxy.createProxyServer({
  target: 'http://localhost:8889',
  changeOrigin: true,
});
mtxProxy.on('error', () => {}); // suppress errors

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    https: {},
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[proxy] API error (suppressed):', err.message);
          });
        },
      },
      '/avatars': {
        target: 'http://localhost:5001',
        configure: (proxy) => { proxy.on('error', () => {}); },
      },
      '/snapshots': {
        target: 'http://localhost:5001',
        configure: (proxy) => { proxy.on('error', () => {}); },
      },
      '/ws': {
        target: 'ws://localhost:5001',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[proxy] WS error (suppressed):', err.message);
          });
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', () => {});
          });
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    basicSsl(),
    {
      name: 'mediamtx-proxy',
      configureServer(server) {
        // Intercept ALL requests containing /whep or /whip and proxy to MediaMTX.
        // This catches both initial WHEP/WHIP POSTs AND the trickle ICE PATCH
        // requests that MediaMTX's Location header points to (without /mtx/ prefix).
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url.includes('/whep') || req.url.includes('/whip'))) {
            mtxProxy.web(req, res);
          } else {
            next();
          }
        });
        console.log('[MediaMTX] WHIP/WHEP proxy active (catches /whep and /whip paths)');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
