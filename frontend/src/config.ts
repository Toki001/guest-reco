// Shared API configuration for all components
// In production, VITE_API_URL should point to the central server (e.g., http://192.168.1.100:5001)
// When not set, derives from current browser origin by swapping any dev port to 5001
const envUrl = import.meta.env.VITE_API_URL;

function deriveApiBase(): string {
  if (envUrl) return envUrl;
  const { protocol, hostname, port } = window.location;
  // If port is a known dev port (3000-3999) or different from 5001, swap to 5001
  const backendPort = port && port !== '5001' ? '5001' : port || '5001';
  return `${protocol}//${hostname}:${backendPort}`;
}

export const API_BASE = deriveApiBase();
export const WS_BASE = API_BASE.replace(/^http/, 'ws');
