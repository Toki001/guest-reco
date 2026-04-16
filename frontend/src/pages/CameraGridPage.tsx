import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  const [showQr, setShowQr] = useState(false);
  const [qrDepartment, setQrDepartment] = useState('');
  const [apiKey, setApiKey] = useState('');
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
        <button
          onClick={() => setShowQr(true)}
          className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">qr_code_2</span>
          Add Camera
        </button>
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
              className={`relative rounded-xl overflow-hidden border transition-all group ${
                cam.status === 'live' ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' :
                'border-[var(--border-color)]'
              }`}
              style={{ backgroundColor: 'var(--bg-surface)' }}>
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

              <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                <button onClick={(e) => { e.stopPropagation(); setDetailCamera(cam.camera_id); }}
                  className="w-9 h-9 rounded-xl bg-white/20 hover:bg-violet-500 flex items-center justify-center transition-colors backdrop-blur-md border border-white/20 shadow-lg" title="View Faces">
                  <span className="material-symbols-outlined text-white text-base">group</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setFullscreen(cam.camera_id); }}
                  className="w-9 h-9 rounded-xl bg-white/20 hover:bg-blue-500 flex items-center justify-center transition-colors backdrop-blur-md border border-white/20 shadow-lg" title="Fullscreen">
                  <span className="material-symbols-outlined text-white text-base">fullscreen</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleRemove(cam.camera_id); }}
                  disabled={removing === cam.camera_id}
                  className="w-9 h-9 rounded-xl bg-white/20 hover:bg-red-500 flex items-center justify-center transition-colors backdrop-blur-md border border-white/20 shadow-lg disabled:opacity-50" title="Remove camera">
                  <span className="material-symbols-outlined text-white text-base">{removing === cam.camera_id ? 'hourglass_empty' : 'delete'}</span>
                </button>
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      cam.status === 'live' ? 'bg-blue-400 animate-pulse' :
                      cam.status === 'connecting' ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'
                    }`} />
                    <span className="text-[var(--text-primary)] text-xs font-semibold capitalize">{cam.camera_id.replace(/-/g, ' ')}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    cam.status === 'live' ? 'bg-blue-500/20 text-blue-400' :
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
                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-blue-500/60 text-[10px] font-medium">Connecting</p>
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
            <span className="text-white font-semibold text-sm capitalize">{fullscreen.replace(/-/g, ' ')}</span>
            <span className="bg-blue-500/20 text-blue-400 text-[10px] font-mono font-bold px-2 py-1 rounded">LIVE</span>
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

      {/* Camera Detail Panel */}
      {detailCamera && (
        <CameraDetailPanel cameraId={detailCamera} onClose={() => setDetailCamera(null)} />
      )}

      {/* QR Code Setup Modal */}
      {showQr && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setShowQr(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 page-enter"
            style={{
              background: 'var(--modal-bg)',
              backdropFilter: 'blur(24px) saturate(1.3)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25), var(--glass-inset-highlight)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent)]">qr_code_2</span>
                Camera QR Setup
              </h3>
              <button onClick={() => setShowQr(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Department Name</label>
                <input
                  type="text"
                  value={qrDepartment}
                  onChange={e => setQrDepartment(e.target.value)}
                  placeholder="e.g. main-entrance"
                  className="w-full rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] bg-white/[0.06] border border-[var(--glass-border)] focus:border-[var(--accent)] focus:outline-none transition-colors placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Camera API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Paste API key from server console"
                  className="w-full rounded-xl px-3 py-2 text-sm font-mono text-[var(--text-primary)] bg-white/[0.06] border border-[var(--glass-border)] focus:border-[var(--accent)] focus:outline-none transition-colors placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>

            {qrDepartment && apiKey ? (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG
                    value={`${window.location.origin}/camera/${qrDepartment.toLowerCase().replace(/\s+/g, '-')}?key=${apiKey}`}
                    size={180}
                    level="M"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-muted)] text-center max-w-[220px]">
                  Scan this QR code from the camera tablet to auto-configure the station
                </p>
                <div className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-[var(--glass-border)]">
                  <p className="text-[9px] text-[var(--text-muted)] font-mono break-all">
                    {`${window.location.origin}/camera/${qrDepartment.toLowerCase().replace(/\s+/g, '-')}?key=${apiKey}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-3xl opacity-30 block mb-1">qr_code_2</span>
                <p className="text-xs">Fill in both fields to generate QR code</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraGridPage;
