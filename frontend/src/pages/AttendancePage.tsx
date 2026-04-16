import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, getAuthWsUrl } from '../auth';
import { API_BASE } from '../config';

interface ActiveUser {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  clock_in_time: string;
  camera_id: string | null;
}

function AttendancePage() {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'Employee' | 'Guest'>('all');
  const wsRef = useRef<WebSocket | null>(null);

  const fetchActive = useCallback(async () => {
    try {
      const res = await authFetch('/api/attendance/active');
      if (res.ok) setActiveUsers(await res.json());
    } catch (e) {
      console.error('Failed to fetch active users:', e);
    } finally {
      setActiveLoading(false);
    }
  }, []);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'recognition_result') {
          fetchActive();
        }
      } catch {}
    };

    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => ws.close();

    return () => { ws.close(); };
  }, [fetchActive]);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ts; }
  };

  const filteredUsers = roleFilter === 'all' ? activeUsers : activeUsers.filter(u => u.role === roleFilter);

  return (
    <div className="flex flex-col w-full pb-10">
      <div className="flex items-center justify-end gap-2 mb-4">
        <a
          href={`${API_BASE}/api/export/attendance`}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          Export CSV
        </a>
        <button onClick={fetchActive}
          className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh
        </button>
      </div>

      {/* Who's In Right Now */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-500">groups</span>
            Who's In Right Now
            <span className="text-sm font-normal text-slate-400">({filteredUsers.length})</span>
          </h3>
          <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-0.5">
            {(['all', 'Employee', 'Guest'] as const).map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  roleFilter === role
                    ? 'bg-[#2EA3F2] text-white shadow-sm'
                    : 'text-slate-400 hover:text-[var(--text-primary)]'
                }`}
              >
                {role === 'all' ? 'All' : role === 'Employee' ? 'Employees' : 'Guests'}
              </button>
            ))}
          </div>
        </div>

        {activeLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">person_off</span>
            <p className="text-slate-400">{roleFilter === 'all' ? 'No one currently on site' : `No ${roleFilter === 'Employee' ? 'employees' : 'guests'} currently on site`}</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {filteredUsers.map(user => (
              <div key={user.id} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] p-4 flex items-center gap-3">
                {getImageUrl(user.image_url) ? (
                  <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)] shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      user.role === 'Guest' ? 'bg-amber-100 text-amber-600 '
                        : 'bg-blue-100 text-blue-600 '
                    }`}>{user.role}</span>
                    <span>{formatTime(user.clock_in_time)}</span>
                  </div>
                  {user.camera_id && (
                    <p className="text-[10px] text-slate-400 capitalize mt-0.5">{user.camera_id.replace(/-/g, ' ')}</p>
                  )}
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AttendancePage;
