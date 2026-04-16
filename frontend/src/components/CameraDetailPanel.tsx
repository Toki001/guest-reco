import { useState, useEffect } from 'react';
import { authFetch } from '../auth';
import { API_BASE } from '../config';

interface CameraFace {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  visit_count: number;
  last_seen: string;
  first_seen: string;
}

interface CameraStats {
  camera_id: string;
  total_scans: number;
  scans_today: number;
  unique_faces: number;
  unique_faces_today: number;
  last_activity: string | null;
}

interface ActivityItem {
  id: number;
  user_id: string;
  name: string;
  image_url: string | null;
  role: string;
  status: string;
  confidence: number;
  timestamp: string;
}

interface Props {
  cameraId: string;
  onClose: () => void;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CameraDetailPanel({ cameraId, onClose }: Props) {
  const [faces, setFaces] = useState<CameraFace[]>([]);
  const [stats, setStats] = useState<CameraStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tab, setTab] = useState<'faces' | 'activity'>('faces');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      authFetch(`/api/cameras/${encodeURIComponent(cameraId)}/faces`).then(r => r.ok ? r.json() : []),
      authFetch(`/api/cameras/${encodeURIComponent(cameraId)}/stats`).then(r => r.ok ? r.json() : null),
      authFetch(`/api/cameras/${encodeURIComponent(cameraId)}/activity`).then(r => r.ok ? r.json() : []),
    ]).then(([facesResult, statsResult, activityResult]) => {
      if (facesResult.status === 'fulfilled') setFaces(facesResult.value);
      if (statsResult.status === 'fulfilled' && statsResult.value) setStats(statsResult.value);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      setLoading(false);
    });
  }, [cameraId]);

  const departmentName = cameraId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="w-full max-w-md overflow-y-auto glass-scrollbar page-enter"
        style={{
          background: 'var(--modal-bg)',
          backdropFilter: 'blur(24px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
          borderLeft: '1px solid var(--glass-border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 p-4"
          style={{
            background: 'var(--modal-bg)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{departmentName}</h2>
              <p className="text-xs text-[var(--text-muted)]">Camera Department</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center transition-colors border border-[var(--glass-border)]">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-sm">close</span>
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { value: stats.scans_today, label: 'Scans Today', color: 'text-blue-400' },
                { value: stats.unique_faces_today, label: 'Faces Today', color: 'text-emerald-400' },
                { value: stats.unique_faces, label: 'Total Faces', color: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="glass-card rounded-xl p-2.5 text-center">
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="glass-card flex gap-0.5 mt-3 rounded-xl p-0.5">
            <button
              onClick={() => setTab('faces')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'faces' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Faces ({faces.length})
            </button>
            <button
              onClick={() => setTab('activity')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'activity' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Activity ({activity.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
          ) : tab === 'faces' ? (
            faces.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-3xl block mb-2 opacity-30">person_off</span>
                <p className="text-xs">No faces captured at this camera yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {faces.map(face => (
                  <div key={face.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-[var(--glass-border)]">
                      {face.image_url ? (
                        <img src={face.image_url.startsWith('/') ? `${API_BASE}${face.image_url}` : face.image_url} alt={face.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-500/10">
                          <span className="material-symbols-outlined text-blue-400 text-lg">person</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{face.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {face.visit_count} visit{face.visit_count !== 1 ? 's' : ''} · Last: {timeAgo(face.last_seen)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                      face.role === 'Employee' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {face.role}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            activity.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <span className="material-symbols-outlined text-3xl block mb-2 opacity-30">history</span>
                <p className="text-xs">No activity at this camera yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map(item => (
                  <div key={item.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-[var(--glass-border)]">
                      {item.image_url ? (
                        <img src={item.image_url.startsWith('/') ? `${API_BASE}${item.image_url}` : item.image_url} alt={item.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-500/10">
                          <span className="material-symbols-outlined text-blue-400 text-sm">person</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{timeAgo(item.timestamp)}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ring-1 ${
                      item.status === 'in'
                        ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
                        : 'bg-red-500/15 text-red-400 ring-red-500/20'
                    }`}>
                      {item.status === 'in' ? 'IN' : 'OUT'}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
