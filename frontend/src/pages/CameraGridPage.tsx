import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthWsUrl, authFetch } from '../auth';

interface CameraFrame {
  camera_id: string;
  frame: string;
  lastUpdate: number;
  fps: number;
  frameCount: number;
}

function CameraGridPage() {
  const [cameras, setCameras] = useState<Map<string, CameraFrame>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const fpsIntervalRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(getAuthWsUrl('/ws/camera-view'));
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.camera_id && msg.removed) {
          // Camera was removed by admin — drop it from the grid
          setCameras(prev => {
            const next = new Map(prev);
            next.delete(msg.camera_id);
            return next;
          });
          setFullscreen(f => f === msg.camera_id ? null : f);
        } else if (msg.camera_id && msg.frame) {
          setCameras(prev => {
            const next = new Map(prev);
            const existing = next.get(msg.camera_id);
            next.set(msg.camera_id, {
              camera_id: msg.camera_id,
              frame: msg.frame,
              lastUpdate: Date.now(),
              fps: existing?.fps || 0,
              frameCount: (existing?.frameCount || 0) + 1,
            });
            return next;
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (mountedRef.current) {
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    const prevCounts = new Map<string, number>();

    fpsIntervalRef.current = window.setInterval(() => {
      setCameras(prev => {
        const next = new Map(prev);
        for (const [id, cam] of next) {
          const prevCount = prevCounts.get(id) || 0;
          const fps = cam.frameCount - prevCount;
          prevCounts.set(id, cam.frameCount);
          next.set(id, { ...cam, fps });
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(fpsIntervalRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (cameraId: string) => {
    if (!confirm(`Remove camera "${cameraId.replace(/-/g, ' ')}"? It will need to re-register to reconnect.`)) return;
    setRemoving(cameraId);
    try {
      await authFetch(`/api/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
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

  const cameraList = Array.from(cameras.values());
  const isStale = (lastUpdate: number) => Date.now() - lastUpdate > 5000;

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
          {cameraList.map(cam => {
            const stale = isStale(cam.lastUpdate);
            return (
              <div
                key={cam.camera_id}
                className={`relative bg-slate-900 rounded-xl overflow-hidden border-2 transition-all group ${
                  stale ? 'border-amber-500/50' : 'border-slate-700 hover:border-blue-500/50'
                }`}
              >
                <div className="cursor-pointer w-full h-full" onClick={() => setFullscreen(cam.camera_id)}>
                  <img
                    src={`data:image/jpeg;base64,${cam.frame}`}
                    alt={cam.camera_id}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Top-right actions — visible on hover */}
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
                      <span className={`w-2 h-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
                      <span className="text-white text-sm font-bold capitalize">
                        {cam.camera_id.replace(/-/g, ' ')}
                      </span>
                    </div>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      stale ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {stale ? 'OFFLINE' : `${cam.fps} fps`}
                    </span>
                  </div>
                </div>
                {stale && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-amber-500 text-3xl">videocam_off</span>
                      <p className="text-amber-400 text-xs mt-1 font-bold">Stream Lost</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fullscreen && cameras.has(fullscreen) && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setFullscreen(null)}
        >
          <img
            src={`data:image/jpeg;base64,${cameras.get(fullscreen)!.frame}`}
            alt={fullscreen}
            className="max-w-full max-h-full object-contain"
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-white font-bold text-lg capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-green-500/20 text-green-400 text-xs font-mono px-2 py-1 rounded">
              {cameras.get(fullscreen)!.fps} fps
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
