import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch, getAuthWsUrl } from '../auth';
import { API_BASE } from '../config';
import { EmptyState } from '../components/EmptyState';
import { downloadCsv } from '../utils/download';
import { HoverCard } from '../components/HoverCard';

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
  const [search, setSearch] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
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

  useEffect(() => {
    const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'recognition_result') { fetchActive(); fetchInactive(); }
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

  const applyFilters = <T extends { name: string; id: string; role: string }>(list: T[]) => {
    let filtered = roleFilter === 'all' ? list : list.filter(u => u.role === roleFilter);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(u => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
    }
    return filtered;
  };

  const filteredActive = applyFilters(activeUsers);
  const filteredInactive = applyFilters(inactiveUsers);

  return (
    <div className="flex flex-col w-full pb-10 page-enter">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-base z-10 pointer-events-none">search</span>
          <input type="text" placeholder="Search name or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
        </div>
        <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
          <button onClick={() => setActiveTab('in')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-semibold transition-all flex items-center ${activeTab === 'in' ? 'bg-emerald-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <span className="material-symbols-outlined text-sm">login</span>
            In
            <span className={`px-1 py-0.5 rounded text-[9px] ${activeTab === 'in' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredActive.length}</span>
          </button>
          <button onClick={() => setActiveTab('out')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[11px] font-semibold transition-all flex items-center ${activeTab === 'out' ? 'bg-red-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <span className="material-symbols-outlined text-sm">logout</span>
            Out
            <span className={`px-1 py-0.5 rounded text-[9px] ${activeTab === 'out' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredInactive.length}</span>
          </button>
        </div>
        <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
          {(['all', 'Employee', 'Guest'] as const).map(role => (
            <button key={role} onClick={() => setRoleFilter(role)}
              className={`px-3 h-9 rounded-lg text-[11px] font-semibold transition-all flex items-center ${roleFilter === role ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {role === 'all' ? 'All' : role === 'Employee' ? 'Employees' : 'Guests'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowExportMenu(s => !s)}
              className="glass-card flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer">
              <span className="material-symbols-outlined text-sm">download</span>
              Export
              <span className="material-symbols-outlined text-[10px]">expand_more</span>
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1 min-w-[160px]"
                  style={{ background: 'var(--modal-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)' }}>
                  {[{ label: 'All Records', role: 'all', icon: 'groups' }, { label: 'Employees Only', role: 'Employee', icon: 'badge' }, { label: 'Guests Only', role: 'Guest', icon: 'person_search' }].map(opt => (
                    <button key={opt.role} onClick={() => { downloadCsv(`/api/export/attendance${opt.role !== 'all' ? `?role=${opt.role}` : ''}`, `attendance_${opt.role.toLowerCase()}.csv`); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                      <span className="material-symbols-outlined text-sm">{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => { fetchActive(); fetchInactive(); }}
            className="glass-card flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* ─── WHO'S IN TABLE ──────────────────────── */}
      {activeTab === 'in' && (
        activeLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filteredActive.length === 0 ? (
          <EmptyState icon="person_off" title="No one currently on site" description={roleFilter !== 'all' ? `No ${roleFilter === 'Employee' ? 'employees' : 'guests'} on site` : 'People will appear here when they clock in'} />
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Currently On Site</h3>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{filteredActive.length} people</span>
            </div>
            <div className="w-full overflow-x-auto glass-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Person</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Clocked In</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Camera</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]">
                  {filteredActive.map(user => (
                    <tr key={user.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3">
                        <HoverCard name={user.name} type={user.role === 'Guest' ? 'guest' : 'employee'} imageUrl={user.image_url || undefined} cameraId={user.camera_id} status="in">
                          <div className="flex items-center gap-2.5 cursor-pointer">
                            {getImageUrl(user.image_url) ? (
                              <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-blue-400 text-xs">person</span>
                              </div>
                            )}
                            <span className="font-semibold text-[var(--text-primary)] text-xs">{user.name}</span>
                          </div>
                        </HoverCard>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{user.id}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${user.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{user.role}</span>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatTime(user.clock_in_time)}</td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] capitalize">{user.camera_id?.replace(/-/g, ' ') || '—'}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">IN</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ─── WHO'S NOT IN TABLE ──────────────────── */}
      {activeTab === 'out' && (
        inactiveLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : filteredInactive.length === 0 ? (
          <EmptyState icon="groups" title="Everyone is on site" description="All registered people are currently clocked in" />
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Not On Site</h3>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{filteredInactive.length} people</span>
            </div>
            <div className="w-full overflow-x-auto glass-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Person</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Seen</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Camera</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]">
                  {filteredInactive.map(user => (
                    <tr key={user.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3">
                        <HoverCard name={user.name} type={user.role === 'Guest' ? 'guest' : 'employee'} imageUrl={user.image_url || undefined} cameraId={user.camera_id} status={user.last_status || undefined}>
                          <div className="flex items-center gap-2.5 cursor-pointer">
                            {getImageUrl(user.image_url) ? (
                              <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-blue-400 text-xs">person</span>
                              </div>
                            )}
                            <span className="font-semibold text-[var(--text-primary)] text-xs">{user.name}</span>
                          </div>
                        </HoverCard>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{user.id}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${user.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{user.role}</span>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatTime(user.last_seen)}</td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] capitalize">{user.camera_id?.replace(/-/g, ' ') || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ring-1 ${
                          user.last_status === 'out' ? 'bg-red-500/15 text-red-400 ring-red-500/20' : 'bg-white/[0.06] text-[var(--text-muted)] ring-[var(--glass-border)]'
                        }`}>{user.last_status === 'out' ? 'OUT' : 'N/A'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default AttendancePage;
