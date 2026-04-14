import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authFetch } from '../auth';
import { API_BASE } from '../config';

interface EmployeeDetail {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  first_seen: string | null;
  last_status: string | null;
  last_seen: string | null;
  last_camera: string | null;
}

interface AttendanceSession {
  time_in: string;
  time_out: string | null;
  camera_in: string | null;
  camera_out: string | null;
  confidence: number;
  duration_seconds: number | null;
}

function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<EmployeeDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const [profileRes, attendanceRes] = await Promise.all([
          authFetch(`/api/employees/${encodeURIComponent(id)}`),
          authFetch(`/api/employees/${encodeURIComponent(id)}/attendance`),
        ]);
        if (profileRes.ok) {
          setProfile(await profileRes.json());
        }
        if (attendanceRes.ok) {
          setAttendance(await attendanceRes.json());
        }
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm(`Delete "${profile?.name || id}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await authFetch(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/employees');
    } catch (e) {
      console.error('Failed to delete:', e);
      setDeleting(false);
    }
  };

  const handleReface = async () => {
    if (!id) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await authFetch(`/api/employees/${encodeURIComponent(id)}/reface`, { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setProfile(prev => prev ? { ...prev, image_url: data.image_url } : prev);
        }
      } catch (e) {
        console.error('Failed to reface:', e);
      }
    };
    input.click();
  };

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDate = (ts: string | null) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleDateString();
    } catch { return ts; }
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  const formatDateTime = (ts: string | null) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString();
    } catch { return ts; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">person_off</span>
        <p className="text-slate-400 mb-4">Employee not found</p>
        <button onClick={() => navigate('/employees')} className="text-blue-600 hover:text-blue-700 font-medium text-sm">Back to Employees</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full  overflow-y-auto pb-10">
      {/* Back button */}
      <button onClick={() => navigate('/employees')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors w-fit">
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        Back to Employees
      </button>

      {/* Profile Card */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] p-6 mb-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="shrink-0">
            {getImageUrl(profile.image_url) ? (
              <img src={getImageUrl(profile.image_url)!} alt={profile.name} className="w-24 h-24 rounded-2xl object-cover border-2 border-[var(--border-color)]" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-slate-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-400 text-4xl">person</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">{profile.name}</h2>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                profile.role === 'Guest' ? 'bg-amber-500/15 text-amber-400 '
                  : 'bg-blue-500/15 text-blue-400'
              }`}>{profile.role}</span>
            </div>
            <p className="text-sm text-slate-400 font-mono mb-3">{profile.id}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">First Seen</p>
                <p className="text-slate-300">{formatDateTime(profile.first_seen)}</p>
              </div>
              <div>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">Last Seen</p>
                <p className="text-slate-300">{formatDateTime(profile.last_seen)}</p>
              </div>
              <div>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">Current Status</p>
                {profile.last_status ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    profile.last_status === 'in' ? 'bg-emerald-100 text-emerald-700 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${profile.last_status === 'in' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {profile.last_status === 'in' ? 'IN' : 'OUT'}
                  </span>
                ) : <span className="text-slate-400">—</span>}
              </div>
              <div>
                <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider mb-0.5">Last Camera</p>
                <p className="text-slate-300 capitalize">{profile.last_camera?.replace(/-/g, ' ') || '—'}</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 shrink-0">
            <button onClick={handleReface} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Re-capture face">
              <span className="material-symbols-outlined text-lg">photo_camera</span>
              Re-face
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50" title="Delete employee">
              <span className="material-symbols-outlined text-lg">{deleting ? 'hourglass_empty' : 'delete'}</span>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Attendance History */}
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-3">Attendance History</h3>
      {attendance.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">event_busy</span>
          <p className="text-slate-400">No attendance records yet.</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--bg-surface)]/80 backdrop-blur-sm">
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Time In</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Time Out</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Camera</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {attendance.map((session, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(session.time_in)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">{formatTime(session.time_in)}</td>
                    <td className="px-4 py-3 text-sm">
                      {session.time_out ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{formatTime(session.time_out)}</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:text-emerald-400">Still In</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 capitalize">
                      {session.camera_in?.replace(/-/g, ' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                      {formatDuration(session.duration_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeProfilePage;
