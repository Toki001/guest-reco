import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import express from 'express';
import { ExpressPeerServer } from 'peer';

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
      name: 'peerjs-server',
      configureServer(server) {
        if (!server.httpServer) return;
        // ExpressPeerServer only creates its WebSocket server when
        // Express's "mount" event fires. Vite's server.middlewares is
        // Connect (not Express), which doesn't emit mount. Fix: wrap
        // in a real Express app so .use() triggers mount properly.
        const wrapper = express();
        const peerApp = ExpressPeerServer(server.httpServer as any, {
          path: '/peer',
          allow_discovery: false,
        });
        wrapper.use(peerApp);
        server.middlewares.use(wrapper);

        (peerApp as any).on('connection', (client: any) => {
          console.log(`[PeerJS] Connected: ${client.getId()}`);
        });
        (peerApp as any).on('disconnect', (client: any) => {
          console.log(`[PeerJS] Disconnected: ${client.getId()}`);
        });
        console.log('[PeerJS] Self-hosted signaling server ready');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
