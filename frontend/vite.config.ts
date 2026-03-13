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
        // ExpressPeerServer attaches a WebSocket upgrade handler directly
        // to httpServer as a side effect. We DON'T use its Express middleware
        // for HTTP routes — Vite's SPA fallback intercepts those. Instead,
        // both camera and viewer use explicit peer IDs, so no HTTP ID
        // generation request is ever made. Only WebSocket signaling is needed.
        const _peerServer = ExpressPeerServer(server.httpServer as any, {
          path: '/peer',
          allow_discovery: true,
        });
        (_peerServer as any).on('connection', (client: any) => {
          console.log(`[PeerJS] Connected: ${client.getId()}`);
        });
        (_peerServer as any).on('disconnect', (client: any) => {
          console.log(`[PeerJS] Disconnected: ${client.getId()}`);
        });
        console.log('[PeerJS] WebSocket signaling attached to Vite HTTPS server');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
