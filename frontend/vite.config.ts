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
        // Attach PeerJS signaling directly to Vite's HTTPS server — no proxy needed.
        // HTTP routes (peer ID assignment) go through connect middleware.
        // WebSocket upgrades (signaling) are handled directly on the httpServer.
        const peerServer = ExpressPeerServer(server.httpServer as any, {
          path: '/peer',
          allow_discovery: true,
        });
        server.middlewares.use(peerServer);
        (peerServer as any).on('connection', (client: any) => {
          console.log(`[PeerJS] Connected: ${client.getId()}`);
        });
        (peerServer as any).on('disconnect', (client: any) => {
          console.log(`[PeerJS] Disconnected: ${client.getId()}`);
        });
        console.log('[PeerJS] Signaling attached to Vite HTTPS server at /peer');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
