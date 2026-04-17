// Shared API configuration for all components
// Vite proxy handles /api, /ws, /avatars, /snapshots -> backend:5001
// So API_BASE is just the current origin (same-origin requests, no CORS)
const envUrl = import.meta.env.VITE_API_URL;

export const API_BASE = envUrl || '';
export const WS_BASE = envUrl
  ? envUrl.replace(/^http/, 'ws')
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
