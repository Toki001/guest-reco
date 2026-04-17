import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, getAuthWsUrl } from '../auth';
import { API_BASE } from '../config';
import { EmptyState } from '../components/EmptyState';
import { downloadCsv } from '../utils/download';

interface ActiveUser {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  clock_in_time: string;
  camera_id: string | null;
}

interface InactiveUser {
  id: string;
  name: string;
  image_url: string | null;
  role: string;
  last_seen: string | null;
  camera_id: string | null;
  last_status: string | null;
}

function AttendancePage() {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUser[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [inactiveLoading, setInactiveLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'Employee' | 'Guest'>('all');
  const [activeTab, setActiveTab] = useState<'in' | 'out'>('in');
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

  const fetchInactive = useCallback(async () => {
    try {
      const res = await authFetch('/api/attendance/inactive');
      if (res.ok) setInactiveUsers(await res.json());
    } catch (e) {
      console.error('Failed to fetch inactive users:', e);
    } finally {
      setInactiveLoading(false);
    }
  }, []);

  useEffect(() => { fetchActive(); fetchInactive(); }, [fetchActive, fetchInactive]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'recognition_result') {
          fetchActive();
          fetchInactive();
        }
      } catch {}
    };
    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => ws.close();
    return () => { ws.close(); };
  }, [fetchActive, fetchInactive]);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return 'Never';
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ts; }
  };

  const filteredActive = roleFilter === 'all' ? activeUsers : activeUsers.filter(u => u.role === roleFilter);
  const filteredInactive = roleFilter === 'all' ? inactiveUsers : inactiveUsers.filter(u => u.role === roleFilter);

  return (
    <div className="flex flex-col w-full pb-10 page-enter">
      {/* Top controls */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          {/* In / Out tabs */}
          <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
            <button
              onClick={() => setActiveTab('in')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'in'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">login</span>
              Who's In
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === 'in' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredActive.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('out')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'out'
                  ? 'bg-red-500 text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              Who's Not In
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === 'out' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredInactive.length}</span>
            </button>
          </div>

          {/* Role filter */}
          <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
            {(['all', 'Employee', 'Guest'] as const).map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  roleFilter === role
                    ? 'bg-[var(--accent)] text-white shadow-md'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {role === 'all' ? 'All' : role === 'Employee' ? 'Employees' : 'Guests'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCsv('/api/export/attendance', 'attendance_export.csv')}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
          <button onClick={() => { fetchActive(); fetchInactive(); }}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* ─── WHO'S IN TAB ─────────────────────── */}
      {activeTab === 'in' && (
        <>
          {activeLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : filteredActive.length === 0 ? (
            <EmptyState icon="person_off" title="No one currently on site" description={roleFilter !== 'all' ? `No ${roleFilter === 'Employee' ? 'employees' : 'guests'} currently on site` : 'People will appear here when they clock in'} />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {filteredActive.map(user => (
                <div key={user.id} className="glass-card rounded-xl p-4 flex items-center gap-3" style={{ boxShadow: 'var(--glass-shadow), var(--glow-emerald)' }}>
                  {getImageUrl(user.image_url) ? (
                    <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-10 h-10 rounded-xl object-cover border border-[var(--glass-border)] shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-[var(--glass-border)] shrink-0">
                      <span className="material-symbols-outlined text-blue-400 text-sm">person</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        user.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>{user.role}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{formatTime(user.clock_in_time)}</span>
                    </div>
                    {user.camera_id && (
                      <p className="text-[10px] text-[var(--text-muted)] capitalize mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">videocam</span>
                        {user.camera_id.replace(/-/g, ' ')}
                      </p>
                    )}
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── WHO'S NOT IN TAB ─────────────────── */}
      {activeTab === 'out' && (
        <>
          {inactiveLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : filteredInactive.length === 0 ? (
            <EmptyState icon="groups" title="Everyone is on site" description="All registered people are currently clocked in" />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {filteredInactive.map(user => (
                <div key={user.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
                  {getImageUrl(user.image_url) ? (
                    <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-10 h-10 rounded-xl object-cover border border-[var(--glass-border)] shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-[var(--glass-border)] shrink-0">
                      <span className="material-symbols-outlined text-blue-400 text-sm">person</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        user.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>{user.role}</span>
                      {user.last_seen ? (
                        <span className="text-[10px] text-[var(--text-muted)]">Last: {formatTime(user.last_seen)}</span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">Never scanned</span>
                      )}
                    </div>
                    {user.camera_id && (
                      <p className="text-[10px] text-[var(--text-muted)] capitalize mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">videocam</span>
                        {user.camera_id.replace(/-/g, ' ')}
                      </p>
                    )}
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AttendancePage;
