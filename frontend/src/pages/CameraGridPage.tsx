import { useState, useEffect, useRef, useCallback } from 'react';
import { MediaMTXWebRTCReader } from 'mediamtx-webrtc-react';
import { getAuthWsUrl, authFetch } from '../auth';
import CameraDetailPanel from '../components/CameraDetailPanel';

interface CameraDisplay {
  camera_id: string;
  status: 'connecting' | 'live' | 'offline';
}

function WHEPVideo({ cameraId, onLive, className }: { cameraId: string; onLive: () => void; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => {
    if (!containerRef.current) return;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000';
    containerRef.current.appendChild(video);

    // Mark as live when video actually starts playing visible frames
    video.onplaying = () => onLiveRef.current();

    const whepUrl = `${location.origin}/${encodeURIComponent(cameraId)}/whep`;
    console.log(`[Viewer] Creating reader for ${cameraId}: ${whepUrl}`);

    const reader = new MediaMTXWebRTCReader({
      url: whepUrl,
      onTrack: (evt: RTCTrackEvent) => {
        console.log(`[Viewer] ${cameraId}: got track ${evt.track.kind}, streams: ${evt.streams.length}`);
        if (evt.streams[0]) {
          video.srcObject = evt.streams[0];
          video.play().catch(e => console.log(`[Viewer] ${cameraId}: play error:`, e));
          onLiveRef.current();
        }
      },
      onError: (err: string) => {
        console.log(`[Viewer] ${cameraId}: ${err}`);
      },
    });

    return () => {
      reader.close();
      video.srcObject = null;
      video.remove();
    };
  }, [cameraId]);

  return <div ref={containerRef} className={className} style={{ minHeight: '180px', background: '#000' }} />;
}

function CameraGridPage() {
  const [cameras, setCameras] = useState<Map<string, CameraDisplay>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [detailCamera, setDetailCamera] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const deletedRef = useRef<Set<string>>(new Set());

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
        if (!next.has(cam.camera_id))
          next.set(cam.camera_id, { camera_id: cam.camera_id, status: cam.is_online ? 'connecting' : 'offline' });
      }
      return next;
    });

    setIsConnected(true);

    const dashWs = new WebSocket(getAuthWsUrl('/ws/dashboard'));

    dashWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'camera_online' && msg.data?.camera_id) {
          if (deletedRef.current.has(msg.data.camera_id)) return; // don't re-add deleted cameras
          setCameras(prev => {
            const next = new Map(prev);
            next.set(msg.data.camera_id, { camera_id: msg.data.camera_id, status: 'connecting' });
            return next;
          });
        }
        if (msg.event === 'camera_offline' && msg.data?.camera_id) {
          if (msg.data.removed) {
            setCameras(prev => { const next = new Map(prev); next.delete(msg.data.camera_id); return next; });
          } else {
            setCameras(prev => {
              const next = new Map(prev);
              next.set(msg.data.camera_id, { camera_id: msg.data.camera_id, status: 'offline' });
              return next;
            });
          }
        }
      } catch {}
    };

    dashWs.onclose = () => {
      setIsConnected(false);
      if (mountedRef.current) setTimeout(connect, 5000);
    };
    dashWs.onerror = () => dashWs.close();

    return dashWs;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let ws: WebSocket | undefined;
    connect().then(w => { ws = w; });
    return () => { mountedRef.current = false; ws?.close(); };
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
      deletedRef.current.add(cameraId);
      setCameras(prev => { const next = new Map(prev); next.delete(cameraId); return next; });
      if (fullscreen === cameraId) setFullscreen(null);
    } catch (e) {
      console.error('Failed to remove camera:', e);
    }
    setRemoving(null);
  };

  const cameraList = Array.from(cameras.values());

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto pb-10">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {isConnected ? `${cameraList.filter(c => c.status === 'live').length} streaming` : 'Disconnected'}
          </div>
          <span className="text-[10px] text-slate-600">{cameraList.length} cameras registered</span>
        </div>
      </div>

      {cameraList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-4xl text-slate-700 mb-3 block">videocam_off</span>
            <p className="text-slate-500 text-sm">No camera streams active.</p>
            <p className="text-slate-600 text-xs mt-1">Open /camera/department-name on a device to start streaming.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gridAutoRows: 'minmax(220px, auto)' }}>
          {cameraList.map(cam => (
            <div key={cam.camera_id}
              className={`relative bg-[#0f1023] rounded-xl overflow-hidden border transition-all group ${
                cam.status === 'live' ? 'border-cyan-500/30 shadow-lg shadow-cyan-500/5' :
                cam.status === 'offline' ? 'border-[var(--border-color)]' :
                'border-[var(--border-color)]'
              }`}>
              <div className="cursor-pointer w-full h-full" onClick={() => setFullscreen(cam.camera_id)}>
                {/* Always render — MediaMTXWebRTCReader manages its own retry
                    with exponential backoff. Won't exhaust PeerConnections. */}
                <WHEPVideo
                  cameraId={cam.camera_id}
                  className="w-full h-full object-cover"
                  onLive={() => {
                    setCameras(prev => {
                      const existing = prev.get(cam.camera_id);
                      if (!existing || existing.status === 'live') return prev; // no-op if already live or deleted
                      const next = new Map(prev);
                      next.set(cam.camera_id, { camera_id: cam.camera_id, status: 'live' });
                      return next;
                    });
                  }}
                />
              </div>

              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onClick={(e) => { e.stopPropagation(); setDetailCamera(cam.camera_id); }}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-purple-600 flex items-center justify-center transition-colors backdrop-blur-sm" title="View Faces">
                  <span className="material-symbols-outlined text-[var(--text-primary)] text-base">group</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setFullscreen(cam.camera_id); }}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-blue-600 flex items-center justify-center transition-colors backdrop-blur-sm" title="Fullscreen">
                  <span className="material-symbols-outlined text-[var(--text-primary)] text-base">fullscreen</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleRemove(cam.camera_id); }}
                  disabled={removing === cam.camera_id}
                  className="w-8 h-8 rounded-lg bg-black/60 hover:bg-red-600 flex items-center justify-center transition-colors backdrop-blur-sm disabled:opacity-50" title="Remove camera">
                  <span className="material-symbols-outlined text-[var(--text-primary)] text-base">{removing === cam.camera_id ? 'hourglass_empty' : 'delete'}</span>
                </button>
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      cam.status === 'live' ? 'bg-cyan-400 animate-pulse' :
                      cam.status === 'connecting' ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'
                    }`} />
                    <span className="text-[var(--text-primary)] text-xs font-semibold capitalize">{cam.camera_id.replace(/-/g, ' ')}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    cam.status === 'live' ? 'bg-cyan-500/20 text-cyan-400' :
                    cam.status === 'connecting' ? 'bg-blue-500/20 text-blue-400' : 'bg-[var(--bg-surface-hover)] text-slate-500'
                  }`}>
                    {cam.status === 'live' ? 'LIVE' : cam.status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* Overlays */}
              {cam.status === 'offline' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-slate-600 text-3xl">videocam_off</span>
                    <p className="text-slate-500 text-[10px] mt-1 font-medium">No Signal</p>
                  </div>
                </div>
              )}
              {cam.status === 'connecting' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-cyan-500/60 text-[10px] font-medium">Connecting</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {fullscreen && cameras.has(fullscreen) && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setFullscreen(null)}>
          <WHEPVideo
            cameraId={fullscreen}
            className="max-w-full max-h-full object-contain"
            onLive={() => {}}
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <span className="text-[var(--text-primary)] font-semibold text-sm capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold px-2 py-1 rounded">LIVE</span>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button className="w-10 h-10 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center transition-colors"
              onClick={(e) => { e.stopPropagation(); handleRemove(fullscreen); }}>
              <span className="material-symbols-outlined text-[var(--text-primary)]">delete</span>
            </button>
            <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              onClick={() => setFullscreen(null)}>
              <span className="material-symbols-outlined text-[var(--text-primary)]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Camera Detail Panel — shows faces and activity for selected camera */}
      {detailCamera && (
        <CameraDetailPanel cameraId={detailCamera} onClose={() => setDetailCamera(null)} />
      )}
    </div>
  );
}

export default CameraGridPage;
