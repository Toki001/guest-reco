import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthWsUrl, authFetch } from '../auth';

interface CameraDisplay {
  camera_id: string;
  status: 'connecting' | 'live' | 'offline';
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function CameraGridPage() {
  const [cameras, setCameras] = useState<Map<string, CameraDisplay>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  // PeerConnections stored in ref (NOT in state) — async ops need stable references
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const attachStream = useCallback((cameraId: string, stream: MediaStream) => {
    const el = videoRefs.current.get(cameraId);
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, []);

  const setupPeerConnection = useCallback((ws: WebSocket, cameraId: string) => {
    // Close existing PC if any
    const existingPc = pcsRef.current.get(cameraId);
    if (existingPc) {
      existingPc.close();
      pcsRef.current.delete(cameraId);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcsRef.current.set(cameraId, pc);

    setCameras(prev => {
      const next = new Map(prev);
      next.set(cameraId, { camera_id: cameraId, status: 'connecting' });
      return next;
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        setCameras(prev => {
          const next = new Map(prev);
          next.set(cameraId, { camera_id: cameraId, status: 'live' });
          return next;
        });
        attachStream(cameraId, stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          camera_id: cameraId,
          data: event.candidate.toJSON()
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCameras(prev => {
          const next = new Map(prev);
          next.set(cameraId, { camera_id: cameraId, status: 'offline' });
          return next;
        });
      }
    };

    // Create receive-only offer
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'offer',
            camera_id: cameraId,
            data: pc.localDescription
          }));
        }
      })
      .catch(e => console.error('Failed to create offer:', e));

    return pc;
  }, [attachStream]);

  const closeAllPCs = useCallback(() => {
    pcsRef.current.forEach(pc => pc.close());
    pcsRef.current.clear();
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    let onlineCameras: string[] = [];
    try {
      const res = await authFetch('/api/cameras');
      if (res.ok) {
        const list = await res.json();
        onlineCameras = list.filter((c: any) => c.is_online).map((c: any) => c.camera_id);
      }
    } catch {}

    if (!mountedRef.current) return;

    const ws = new WebSocket(getAuthWsUrl('/ws/viewer-signal'));
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      for (const cameraId of onlineCameras) {
        ws.send(JSON.stringify({ type: 'subscribe', camera_id: cameraId }));
      }
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'subscribed') {
          setupPeerConnection(ws, msg.camera_id);
        }

        if (msg.type === 'answer') {
          // Use ref directly — NOT inside setCameras
          const pc = pcsRef.current.get(msg.camera_id);
          if (pc && pc.signalingState !== 'closed') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          }
        }

        if (msg.type === 'ice-candidate') {
          const pc = pcsRef.current.get(msg.camera_id);
          if (pc && pc.signalingState !== 'closed') {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data));
          }
        }

        if (msg.type === 'camera-removed') {
          const pc = pcsRef.current.get(msg.camera_id);
          if (pc) {
            pc.close();
            pcsRef.current.delete(msg.camera_id);
          }
          setCameras(prev => {
            const next = new Map(prev);
            next.delete(msg.camera_id);
            return next;
          });
          setFullscreen(f => f === msg.camera_id ? null : f);
        }
      } catch (e) {
        console.error('Viewer signaling error:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      closeAllPCs();
      setCameras(new Map());
      if (mountedRef.current) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, [setupPeerConnection, closeAllPCs]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      closeAllPCs();
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect, closeAllPCs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRemove = async (cameraId: string) => {
    if (!confirm(`Remove camera "${cameraId.replace(/-/g, ' ')}"? It will need to re-register to reconnect.`)) return;
    setRemoving(cameraId);
    try {
      await authFetch(`/api/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
      const pc = pcsRef.current.get(cameraId);
      if (pc) { pc.close(); pcsRef.current.delete(cameraId); }
      setCameras(prev => {
        const next = new Map(prev);
        next.delete(cameraId);
        return next;
      });
      if (fullscreen === cameraId) setFullscreen(null);
    } catch (e) {
      console.error('Failed to remove camera:', e);
    }
    setRemoving(null);
  };

  const setVideoRef = useCallback((cameraId: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current.set(cameraId, el);
    } else {
      videoRefs.current.delete(cameraId);
    }
  }, []); // No deps — refs are stable

  const cameraList = Array.from(cameras.values());

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Camera Grid</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Live feeds from all connected camera stations.
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
          isConnected ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {isConnected ? `Live \u2014 ${cameraList.length} cameras` : 'Disconnected'}
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
            <div
              key={cam.camera_id}
              className={`relative bg-slate-900 rounded-xl overflow-hidden border-2 transition-all group ${
                cam.status === 'offline' ? 'border-amber-500/50' :
                cam.status === 'live' ? 'border-slate-700 hover:border-blue-500/50' :
                'border-slate-700 animate-pulse'
              }`}
            >
              <div className="cursor-pointer w-full h-full" onClick={() => setFullscreen(cam.camera_id)}>
                <video
                  ref={(el) => setVideoRef(cam.camera_id, el)}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setFullscreen(cam.camera_id); }}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-blue-600 flex items-center justify-center transition-colors backdrop-blur-sm"
                  title="Fullscreen"
                >
                  <span className="material-symbols-outlined text-white text-base">fullscreen</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(cam.camera_id); }}
                  disabled={removing === cam.camera_id}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-red-600 flex items-center justify-center transition-colors backdrop-blur-sm disabled:opacity-50"
                  title="Remove camera"
                >
                  <span className="material-symbols-outlined text-white text-base">
                    {removing === cam.camera_id ? 'hourglass_empty' : 'delete'}
                  </span>
                </button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      cam.status === 'live' ? 'bg-green-500 animate-pulse' :
                      cam.status === 'connecting' ? 'bg-blue-500 animate-pulse' :
                      'bg-amber-500'
                    }`} />
                    <span className="text-white text-sm font-bold capitalize">
                      {cam.camera_id.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    cam.status === 'live' ? 'bg-green-500/20 text-green-400' :
                    cam.status === 'connecting' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {cam.status === 'live' ? 'LIVE' : cam.status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {cam.status === 'offline' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-amber-500 text-3xl">videocam_off</span>
                    <p className="text-amber-400 text-xs mt-1 font-bold">Stream Lost</p>
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
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setFullscreen(null)}
        >
          <video
            ref={(el) => {
              if (el) {
                const pc = pcsRef.current.get(fullscreen);
                if (pc) {
                  const receivers = pc.getReceivers();
                  const videoReceiver = receivers.find(r => r.track?.kind === 'video');
                  if (videoReceiver?.track) {
                    const stream = new MediaStream([videoReceiver.track]);
                    if (el.srcObject !== stream) el.srcObject = stream;
                  }
                }
              }
            }}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-white font-bold text-lg capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-green-500/20 text-green-400 text-xs font-mono px-2 py-1 rounded">
              WebRTC
            </span>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              className="w-10 h-10 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center transition-colors"
              onClick={(e) => { e.stopPropagation(); handleRemove(fullscreen); }}
              title="Remove camera"
            >
              <span className="material-symbols-outlined text-white">delete</span>
            </button>
            <button
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              onClick={() => setFullscreen(null)}
            >
              <span className="material-symbols-outlined text-white">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraGridPage;
