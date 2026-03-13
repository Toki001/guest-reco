import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { getAuthWsUrl, authFetch } from '../auth';

interface CameraDisplay {
  camera_id: string;
  status: 'connecting' | 'live' | 'offline';
}

const PEER_CONFIG = {
  host: window.location.hostname,
  port: Number(window.location.port) || 443,
  path: '/peer',
  secure: window.location.protocol === 'https:',
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
};

// Reusable dummy stream for the caller side (1x1 canvas, 0fps, ~zero bandwidth).
// PeerJS needs at least one video track in the offer SDP so the answerer's
// video can be negotiated back.
let _dummyStream: MediaStream | null = null;
function getDummyStream(): MediaStream {
  if (!_dummyStream) {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    c.getContext('2d')!.fillRect(0, 0, 1, 1);
    _dummyStream = c.captureStream(0);
  }
  return _dummyStream;
}

function CameraGridPage() {
  const [cameras, setCameras] = useState<Map<string, CameraDisplay>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const mountedRef = useRef(true);
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  // Track which cameras have a live stream — prevents retry storm
  const liveRef = useRef<Set<string>>(new Set());

  const attachStream = useCallback((cameraId: string, stream: MediaStream) => {
    streamsRef.current.set(cameraId, stream);
    const el = videoRefs.current.get(cameraId);
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, []);

  const clearRetry = useCallback((cameraId: string) => {
    const t = retryTimersRef.current.get(cameraId);
    if (t) { clearTimeout(t); retryTimersRef.current.delete(cameraId); }
  }, []);

  const callCamera = useCallback((peer: Peer, cameraId: string) => {
    if (peer.destroyed || peer.disconnected) return;

    const peerId = `gr-cam-${cameraId}`;

    // If there's already a live stream for this camera, don't create a new call
    if (liveRef.current.has(cameraId)) return;

    // Clean up any existing call
    const existing = callsRef.current.get(cameraId);
    if (existing) { existing.close(); callsRef.current.delete(cameraId); }

    clearRetry(cameraId);

    setCameras(prev => {
      const next = new Map(prev);
      next.set(cameraId, { camera_id: cameraId, status: 'connecting' });
      return next;
    });

    console.log(`[Viewer] Calling ${peerId}`);
    const call = peer.call(peerId, getDummyStream(), { metadata: { viewer: true } });
    if (!call) return; // peer.call returns null if peer is disconnected
    callsRef.current.set(cameraId, call);

    call.on('stream', (remoteStream) => {
      console.log(`[Viewer] Got stream from ${cameraId}`);
      clearRetry(cameraId);
      liveRef.current.add(cameraId);
      setCameras(prev => {
        const next = new Map(prev);
        next.set(cameraId, { camera_id: cameraId, status: 'live' });
        return next;
      });
      attachStream(cameraId, remoteStream);
    });

    call.on('close', () => {
      console.log(`[Viewer] Call closed: ${cameraId}`);
      const wasLive = liveRef.current.has(cameraId);
      liveRef.current.delete(cameraId);
      callsRef.current.delete(cameraId);
      streamsRef.current.delete(cameraId);

      if (!mountedRef.current) return;

      setCameras(prev => {
        const next = new Map(prev);
        if (next.has(cameraId)) {
          next.set(cameraId, { camera_id: cameraId, status: 'connecting' });
        }
        return next;
      });

      // Only auto-retry if the stream was previously live (genuine drop)
      // or if the call was never answered (initial connection attempt failed).
      // Use a longer delay to avoid hammering.
      if (peerRef.current && !peerRef.current.destroyed) {
        const delay = wasLive ? 2000 : 5000;
        const timer = window.setTimeout(() => {
          retryTimersRef.current.delete(cameraId);
          if (peerRef.current && !peerRef.current.destroyed) {
            callCamera(peerRef.current, cameraId);
          }
        }, delay);
        retryTimersRef.current.set(cameraId, timer);
      }
    });

    call.on('error', (err) => {
      console.error(`[Viewer] Call error (${cameraId}):`, err.message);
    });
  }, [attachStream, clearRetry]);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    let allCameras: { camera_id: string; is_online: number }[] = [];
    try {
      const res = await authFetch('/api/cameras');
      if (res.ok) allCameras = await res.json();
    } catch {}

    if (!mountedRef.current) return;

    setCameras(prev => {
      const next = new Map(prev);
      for (const cam of allCameras) {
        if (!next.has(cam.camera_id)) {
          next.set(cam.camera_id, { camera_id: cam.camera_id, status: cam.is_online ? 'connecting' : 'offline' });
        }
      }
      return next;
    });

    // Self-hosted PeerJS on same server — offline-first, no cloud dependency
    const viewerId = `gr-viewer-${Math.random().toString(36).substr(2, 10)}`;
    const peer = new Peer(viewerId, PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      console.log('[Viewer] Connected to PeerJS signaling');
      setIsConnected(true);
      for (const cam of allCameras) {
        if (cam.is_online) callCamera(peer, cam.camera_id);
      }
    });

    peer.on('disconnected', () => {
      console.log('[Viewer] PeerJS disconnected, reconnecting...');
      setIsConnected(false);
      if (!peer.destroyed) peer.reconnect();
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        const match = err.message.match(/peer\s+gr-cam-(.+)$/);
        if (match) {
          const camId = match[1];
          console.log(`[Viewer] Camera ${camId} not ready, will retry in 5s`);
          clearRetry(camId);
          const timer = window.setTimeout(() => {
            retryTimersRef.current.delete(camId);
            if (peer && !peer.destroyed) callCamera(peer, camId);
          }, 5000);
          retryTimersRef.current.set(camId, timer);
        }
        return;
      }
      console.error('[Viewer] PeerJS error:', err.type);
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        setIsConnected(false);
        setTimeout(() => {
          if (mountedRef.current && !peer.destroyed) peer.reconnect();
        }, 3000);
      }
    });

    peer.on('close', () => {
      setIsConnected(false);
      if (mountedRef.current) setTimeout(connect, 5000);
    });

    // Dashboard WS for camera online/offline events
    const dashWs = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    (peer as any)._dashWs = dashWs;

    dashWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'camera_online' && msg.data?.camera_id) {
          const cameraId = msg.data.camera_id;
          setCameras(prev => {
            const next = new Map(prev);
            next.set(cameraId, { camera_id: cameraId, status: 'connecting' });
            return next;
          });
          // Delay to let camera's PeerJS peer register
          if (peer && !peer.destroyed) {
            clearRetry(cameraId);
            const timer = window.setTimeout(() => {
              retryTimersRef.current.delete(cameraId);
              callCamera(peer, cameraId);
            }, 3000);
            retryTimersRef.current.set(cameraId, timer);
          }
        }
        if (msg.event === 'camera_offline' && msg.data?.camera_id) {
          const cameraId = msg.data.camera_id;
          clearRetry(cameraId);
          liveRef.current.delete(cameraId);
          const call = callsRef.current.get(cameraId);
          if (call) { call.close(); callsRef.current.delete(cameraId); }
          streamsRef.current.delete(cameraId);
          if (msg.data.removed) {
            setCameras(prev => { const next = new Map(prev); next.delete(cameraId); return next; });
          } else {
            setCameras(prev => {
              const next = new Map(prev);
              next.set(cameraId, { camera_id: cameraId, status: 'offline' });
              return next;
            });
          }
        }
      } catch {}
    };
    dashWs.onerror = () => dashWs.close();
  }, [callCamera, clearRetry]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      retryTimersRef.current.forEach(t => clearTimeout(t));
      retryTimersRef.current.clear();
      liveRef.current.clear();
      callsRef.current.forEach(c => c.close());
      callsRef.current.clear();
      if (peerRef.current) {
        const dashWs = (peerRef.current as any)?._dashWs;
        if (dashWs) dashWs.close();
        peerRef.current.destroy();
      }
    };
  }, [connect]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRemove = async (cameraId: string) => {
    if (!confirm(`Remove camera "${cameraId.replace(/-/g, ' ')}"?`)) return;
    setRemoving(cameraId);
    try {
      await authFetch(`/api/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
      clearRetry(cameraId);
      liveRef.current.delete(cameraId);
      const call = callsRef.current.get(cameraId);
      if (call) { call.close(); callsRef.current.delete(cameraId); }
      setCameras(prev => { const next = new Map(prev); next.delete(cameraId); return next; });
      if (fullscreen === cameraId) setFullscreen(null);
    } catch (e) {
      console.error('Failed to remove camera:', e);
    }
    setRemoving(null);
  };

  const setVideoRef = useCallback((cameraId: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current.set(cameraId, el);
      const stream = streamsRef.current.get(cameraId);
      if (stream && el.srcObject !== stream) el.srcObject = stream;
    } else {
      videoRefs.current.delete(cameraId);
    }
  }, []);

  const cameraList = Array.from(cameras.values());

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Camera Grid</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Live feeds from all connected camera stations.</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
          isConnected ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {isConnected ? `Live \u2014 ${cameraList.filter(c => c.status === 'live').length} streaming` : 'Disconnected'}
        </div>
      </div>

      {cameraList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">videocam_off</span>
            <p className="text-slate-500 dark:text-slate-400">No camera streams active.</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Open /camera/department-name on a device to start streaming.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gridAutoRows: 'minmax(200px, auto)' }}>
          {cameraList.map(cam => (
            <div key={cam.camera_id}
              className={`relative bg-slate-900 rounded-xl overflow-hidden border-2 transition-all group ${
                cam.status === 'offline' ? 'border-amber-500/50' :
                cam.status === 'live' ? 'border-slate-700 hover:border-blue-500/50' :
                'border-slate-700 animate-pulse'
              }`}>
              <div className="cursor-pointer w-full h-full" onClick={() => setFullscreen(cam.camera_id)}>
                <video ref={(el) => setVideoRef(cam.camera_id, el)} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>

              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onClick={(e) => { e.stopPropagation(); setFullscreen(cam.camera_id); }}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-blue-600 flex items-center justify-center transition-colors backdrop-blur-sm" title="Fullscreen">
                  <span className="material-symbols-outlined text-white text-base">fullscreen</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleRemove(cam.camera_id); }}
                  disabled={removing === cam.camera_id}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-red-600 flex items-center justify-center transition-colors backdrop-blur-sm disabled:opacity-50" title="Remove camera">
                  <span className="material-symbols-outlined text-white text-base">{removing === cam.camera_id ? 'hourglass_empty' : 'delete'}</span>
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      cam.status === 'live' ? 'bg-green-500 animate-pulse' :
                      cam.status === 'connecting' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
                    }`} />
                    <span className="text-white text-sm font-bold capitalize">{cam.camera_id.replace(/-/g, ' ')}</span>
                  </div>
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    cam.status === 'live' ? 'bg-green-500/20 text-green-400' :
                    cam.status === 'connecting' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {cam.status === 'live' ? 'LIVE' : cam.status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {cam.status === 'offline' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-amber-500 text-3xl">videocam_off</span>
                    <p className="text-amber-400 text-xs mt-1 font-bold">Offline</p>
                  </div>
                </div>
              )}
              {cam.status === 'connecting' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-blue-400 text-xs font-bold">Connecting...</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {fullscreen && cameras.has(fullscreen) && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setFullscreen(null)}>
          <video
            ref={(el) => {
              if (el) {
                const stream = streamsRef.current.get(fullscreen);
                if (stream && el.srcObject !== stream) el.srcObject = stream;
              }
            }}
            autoPlay playsInline muted className="max-w-full max-h-full object-contain"
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-white font-bold text-lg capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-green-500/20 text-green-400 text-xs font-mono px-2 py-1 rounded">LIVE</span>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button className="w-10 h-10 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center transition-colors"
              onClick={(e) => { e.stopPropagation(); handleRemove(fullscreen); }}>
              <span className="material-symbols-outlined text-white">delete</span>
            </button>
            <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              onClick={() => setFullscreen(null)}>
              <span className="material-symbols-outlined text-white">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraGridPage;
