import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { PeerServer } from 'peer';

// Start PeerJS signaling server on port 9000
const peerServer = PeerServer({ port: 9000, path: '/peer', allow_discovery: true });
peerServer.on('connection', (client: any) => {
  console.log(`[PeerJS] Connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client: any) => {
  console.log(`[PeerJS] Disconnected: ${client.getId()}`);
});
console.log('PeerJS signaling server running on port 9000');

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
      // PeerJS signaling — proxy both HTTP and WebSocket
      '/peer': {
        target: 'http://localhost:9000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
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
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
