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
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-700 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{departmentName}</h2>
              <p className="text-xs text-slate-400">Camera Department</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[var(--text-primary)] text-sm">close</span>
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-400">{stats.scans_today}</div>
                <div className="text-[10px] text-slate-400">Scans Today</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-green-400">{stats.unique_faces_today}</div>
                <div className="text-[10px] text-slate-400">Faces Today</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-amber-400">{stats.unique_faces}</div>
                <div className="text-[10px] text-slate-400">Total Faces</div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setTab('faces')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === 'faces' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-[var(--text-primary)]'
              }`}
            >
              Faces ({faces.length})
            </button>
            <button
              onClick={() => setTab('activity')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === 'activity' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-[var(--text-primary)]'
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
              <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : tab === 'faces' ? (
            faces.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="material-symbols-outlined text-3xl block mb-2">person_off</span>
                No faces captured at this camera yet.
              </div>
            ) : (
              <div className="space-y-2">
                {faces.map(face => (
                  <div key={face.id} className="flex items-center gap-3 bg-slate-800 rounded-lg p-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                      {face.image_url ? (
                        <img src={face.image_url.startsWith('/') ? `${API_BASE}${face.image_url}` : face.image_url} alt={face.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <span className="material-symbols-outlined text-lg">person</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[var(--text-primary)] truncate">{face.name}</div>
                      <div className="text-xs text-slate-400">
                        {face.visit_count} visit{face.visit_count !== 1 ? 's' : ''} · Last: {timeAgo(face.last_seen)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      face.role === 'Employee' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {face.role}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            activity.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="material-symbols-outlined text-3xl block mb-2">history</span>
                No activity at this camera yet.
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-slate-800 rounded-lg p-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                      {item.image_url ? (
                        <img src={item.image_url.startsWith('/') ? `${API_BASE}${item.image_url}` : item.image_url} alt={item.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <span className="material-symbols-outlined text-sm">person</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[var(--text-primary)] truncate">{item.name}</div>
                      <div className="text-xs text-slate-400">{timeAgo(item.timestamp)}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      item.status === 'in' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
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
