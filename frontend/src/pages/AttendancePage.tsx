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

interface EventInfo {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  category: string;
  location: string;
}

interface CameraInfo {
  camera_id: string;
  department: string;
  is_online: number;
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
  const [todayEvents, setTodayEvents] = useState<EventInfo[]>([]);
  const [allEvents, setAllEvents] = useState<EventInfo[]>([]);
  const [showEventBanner, setShowEventBanner] = useState(true);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);

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
    const fetchEvents = async () => {
      try {
        const res = await authFetch('/api/events');
        if (res.ok) {
          const all: EventInfo[] = await res.json();
          setAllEvents(all);
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          setTodayEvents(all.filter(ev => todayStr >= ev.start_date && todayStr <= (ev.end_date || ev.start_date)));
        }
      } catch {}
    };
    fetchEvents();
  }, []);

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await authFetch('/api/cameras');
        if (res.ok) setCameras(await res.json());
      } catch {}
    };
    fetchCameras();
  }, []);

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

  const getCameraDept = (cameraId: string | null) => {
    if (!cameraId) return '';
    const cam = cameras.find(c => c.camera_id === cameraId);
    return cam?.department || cameraId;
  };

  const applyFilters = <T extends { name: string; id: string; role: string; camera_id: string | null }>(list: T[]) => {
    let filtered = roleFilter === 'all' ? list : list.filter(u => u.role === roleFilter);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        (u.camera_id && u.camera_id.toLowerCase().includes(q)) ||
        getCameraDept(u.camera_id).toLowerCase().includes(q) ||
        todayEvents.some(ev =>
          ev.title.toLowerCase().includes(q) ||
          ev.location.toLowerCase().includes(q) ||
          ev.category.toLowerCase().includes(q)
        )
      );
    }
    return filtered;
  };

  const filteredActive = applyFilters(activeUsers);
  const filteredInactive = applyFilters(inactiveUsers);

  const exportFilteredCsv = (label: string, list: Array<ActiveUser | InactiveUser>) => {
    const isIn = activeTab === 'in';
    const headers = ['ID', 'Name', 'Role', isIn ? 'Clocked In' : 'Last Seen', 'Camera', 'Department', 'Status'];
    const rows = list.map(u => [
      u.id,
      u.name,
      u.role,
      isIn ? (u as ActiveUser).clock_in_time || '' : (u as InactiveUser).last_seen || '',
      u.camera_id || '',
      getCameraDept(u.camera_id),
      isIn ? 'IN' : ((u as InactiveUser).last_status === 'out' ? 'OUT' : 'N/A'),
    ]);
    const csvContent = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col w-full pb-10 page-enter">
      {/* Today's Events Banner */}
      {todayEvents.length > 0 && showEventBanner && (
        <div className="glass-card rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-[var(--accent)] text-lg shrink-0">event</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">
              {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} today
            </p>
            <p className="text-[10px] text-[var(--text-muted)] truncate">
              {todayEvents.map(ev => ev.title).join(' · ')}
            </p>
          </div>
          <button onClick={() => setShowEventBanner(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-sm">close</span>
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-base z-10 pointer-events-none">search</span>
          <input type="text" placeholder="Search name, ID, camera, department, event..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
        </div>
        <div className="glass-card flex items-center h-9 rounded-xl overflow-hidden">
          <button onClick={() => setActiveTab('in')}
            className={`flex items-center gap-1.5 px-3 h-full rounded-lg text-[11px] font-semibold transition-all ${activeTab === 'in' ? 'bg-emerald-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <span className="material-symbols-outlined text-sm">login</span>
            In
            <span className={`px-1 py-0.5 rounded text-[9px] ${activeTab === 'in' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredActive.length}</span>
          </button>
          <button onClick={() => setActiveTab('out')}
            className={`flex items-center gap-1.5 px-3 h-full rounded-lg text-[11px] font-semibold transition-all ${activeTab === 'out' ? 'bg-red-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <span className="material-symbols-outlined text-sm">logout</span>
            Out
            <span className={`px-1 py-0.5 rounded text-[9px] ${activeTab === 'out' ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{filteredInactive.length}</span>
          </button>
        </div>
        <div className="glass-card flex items-center h-9 rounded-xl overflow-hidden">
          {(['all', 'Employee', 'Guest'] as const).map(role => (
            <button key={role} onClick={() => setRoleFilter(role)}
              className={`px-3 h-full rounded-lg text-[11px] font-semibold transition-all flex items-center ${roleFilter === role ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
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
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1 min-w-[220px] max-h-[70vh] overflow-y-auto glass-scrollbar"
                  style={{ background: 'var(--modal-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)' }}>

                  {/* Current view */}
                  <button onClick={() => { exportFilteredCsv(`current_view_${activeTab}`, activeTab === 'in' ? filteredActive : filteredInactive); setShowExportMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Current View
                    <span className="text-[9px] text-[var(--text-muted)] ml-auto">{activeTab === 'in' ? filteredActive.length : filteredInactive.length}</span>
                  </button>

                  <div className="h-px bg-[var(--glass-border)] my-1" />

                  {/* Server-side full exports */}
                  {[{ label: 'All Records', role: 'all', icon: 'groups' }, { label: 'Employees Only', role: 'Employee', icon: 'badge' }, { label: 'Guests Only', role: 'Guest', icon: 'person_search' }].map(opt => (
                    <button key={opt.role} onClick={() => { downloadCsv(`/api/export/attendance${opt.role !== 'all' ? `?role=${opt.role}` : ''}`, `attendance_${opt.role.toLowerCase()}.csv`); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                      <span className="material-symbols-outlined text-sm">{opt.icon}</span>{opt.label}
                    </button>
                  ))}

                  {/* Per-event exports */}
                  {allEvents.length > 0 && (
                    <>
                      <div className="h-px bg-[var(--glass-border)] my-1" />
                      <div className="px-4 py-1.5">
                        <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">By Event</span>
                      </div>
                      {allEvents.map(ev => (
                        <button key={ev.id} onClick={() => {
                          const dateFrom = ev.start_date;
                          const dateTo = ev.end_date || ev.start_date;
                          downloadCsv(`/api/export/attendance?date_from=${dateFrom}&date_to=${dateTo}T23:59:59`, `attendance_${ev.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.csv`);
                          setShowExportMenu(false);
                        }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                          <span className="material-symbols-outlined text-sm">event</span>
                          <span className="truncate flex-1">{ev.title}</span>
                          <span className="text-[9px] text-[var(--text-muted)] shrink-0">{ev.start_date}</span>
                        </button>
                      ))}
                    </>
                  )}
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
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                        <span className="capitalize">{getCameraDept(user.camera_id) || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">IN</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--glass-border)]">
              <p className="text-xs text-[var(--text-muted)]">{filteredActive.length} currently on site</p>
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
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                        <span className="capitalize">{getCameraDept(user.camera_id) || '—'}</span>
                      </td>
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
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--glass-border)]">
              <p className="text-xs text-[var(--text-muted)]">{filteredInactive.length} not on site</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default AttendancePage;
