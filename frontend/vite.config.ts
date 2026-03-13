import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
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
        // ExpressPeerServer attaches a ws.WebSocketServer with { path, server }
        // directly to httpServer. The ws library handles upgrade events only for
        // matching paths (/peer/peerjs). No Express middleware needed — we use
        // explicit peer IDs so no HTTP requests are made to PeerJS.
        const _peerApp = ExpressPeerServer(server.httpServer as any, {
          path: '/peer',
          allow_discovery: false,
        });
        (_peerApp as any).on('connection', (client: any) => {
          console.log(`[PeerJS] Peer connected: ${client.getId()}`);
        });
        (_peerApp as any).on('disconnect', (client: any) => {
          console.log(`[PeerJS] Peer disconnected: ${client.getId()}`);
        });
        console.log('[PeerJS] Signaling server attached at /peer (WebSocket only, offline-first)');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
