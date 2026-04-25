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

interface Attendee {
  user_id: string;
  name: string;
  role: string;
  image_url: string | null;
  first_scan: string;
  last_scan: string;
}

interface EventAttendanceData {
  total_scans: number;
  unique_people: number;
  employees: number;
  guests: number;
  cameras: string[];
  attendees: Attendee[];
}

interface AttendanceLogItem {
  id: number;
  user_id: string;
  name: string;
  role: string;
  image_url: string | null;
  status: string;
  confidence: number;
  timestamp: string;
  camera_id: string | null;
}

interface AttendanceLogsResponse {
  total: number;
  page: number;
  per_page: number;
  items: AttendanceLogItem[];
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

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [eventAttendance, setEventAttendance] = useState<EventAttendanceData | null>(null);
  const [eventAttendanceLoading, setEventAttendanceLoading] = useState(false);

  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogsResponse | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);

  const isFiltered = dateFrom !== '' || dateTo !== '' || selectedEventId !== null;

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

  useEffect(() => {
    if (selectedEventId === null) {
      setEventAttendance(null);
      return;
    }
    const fetchEventAttendance = async () => {
      setEventAttendanceLoading(true);
      try {
        const res = await authFetch(`/api/events/${selectedEventId}/attendance`);
        if (res.ok) setEventAttendance(await res.json());
      } catch (e) {
        console.error('Failed to fetch event attendance:', e);
      } finally {
        setEventAttendanceLoading(false);
      }
    };
    fetchEventAttendance();
  }, [selectedEventId, refreshKey]);

  useEffect(() => {
    if (selectedEventId !== null || (!dateFrom && !dateTo)) {
      setAttendanceLogs(null);
      return;
    }
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(logsPage));
        params.set('per_page', '100');
        if (dateFrom) params.set('date_from', `${dateFrom} 00:00:00`);
        if (dateTo) params.set('date_to', `${dateTo} 23:59:59`);
        const res = await authFetch(`/api/attendance?${params.toString()}`);
        if (res.ok) setAttendanceLogs(await res.json());
      } catch (e) {
        console.error('Failed to fetch attendance logs:', e);
      } finally {
        setLogsLoading(false);
      }
    };
    fetchLogs();
  }, [dateFrom, dateTo, selectedEventId, logsPage, refreshKey]);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatTime = (ts: string | null) => {
    if (!ts) return 'Never';
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ts; }
  };

  const formatDateTime = (ts: string | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return ts; }
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

  const filteredEvents = allEvents.filter(ev => {
    if (dateFrom && (ev.end_date || ev.start_date) < dateFrom) return false;
    if (dateTo && ev.start_date > dateTo) return false;
    return true;
  });

  const filteredAttendees = eventAttendance?.attendees.filter(a => {
    if (roleFilter !== 'all' && a.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !a.user_id.toLowerCase().includes(q)) return false;
    }
    return true;
  }) || [];

  const filteredLogs = attendanceLogs?.items.filter(item => {
    if (roleFilter !== 'all' && item.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !item.user_id.toLowerCase().includes(q) &&
          !(item.camera_id && item.camera_id.toLowerCase().includes(q))) return false;
    }
    return true;
  }) || [];

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedEventId(null);
    setLogsPage(1);
  };

  const selectedEvent = allEvents.find(ev => ev.id === selectedEventId);

  const handleRefresh = () => {
    if (isFiltered) {
      setRefreshKey(k => k + 1);
    } else {
      fetchActive();
      fetchInactive();
    }
  };

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
      {!isFiltered && todayEvents.length > 0 && showEventBanner && (
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

      {/* Date & Event Filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--text-muted)] text-sm">calendar_today</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSelectedEventId(null); setLogsPage(1); }}
            className="h-9 px-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
          <span className="text-[10px] text-[var(--text-muted)]">to</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSelectedEventId(null); setLogsPage(1); }}
            className="h-9 px-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
        </div>

        <div className="relative min-w-[200px]">
          <select value={selectedEventId ?? ''} onChange={e => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
            className="h-9 w-full px-3 pr-8 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] bg-[var(--glass-bg)] border border-[var(--glass-border)] appearance-none cursor-pointer">
            <option value="">{dateFrom || dateTo ? 'All records in range' : 'Select an event...'}</option>
            {filteredEvents.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.title} ({ev.start_date})</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm pointer-events-none">expand_more</span>
        </div>

        {isFiltered && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 px-3 h-9 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 transition-all">
            <span className="material-symbols-outlined text-sm">close</span>
            Clear
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-base z-10 pointer-events-none">search</span>
          <input type="text" placeholder={selectedEventId ? "Search attendees..." : "Search name, ID, camera, department..."} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-[var(--glass-bg)] border border-[var(--glass-border)]" />
        </div>
        {!isFiltered && (
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
        )}
        <div className="glass-card flex items-center h-9 rounded-xl overflow-hidden">
          {(['all', 'Employee', 'Guest'] as const).map(role => (
            <button key={role} onClick={() => setRoleFilter(role)}
              className={`px-3 h-full rounded-lg text-[11px] font-semibold transition-all flex items-center ${roleFilter === role ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {role === 'all' ? 'All' : role === 'Employee' ? 'Employees' : 'Guests'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isFiltered && (
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

                    <button onClick={() => { exportFilteredCsv(`current_view_${activeTab}`, activeTab === 'in' ? filteredActive : filteredInactive); setShowExportMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Current View
                      <span className="text-[9px] text-[var(--text-muted)] ml-auto">{activeTab === 'in' ? filteredActive.length : filteredInactive.length}</span>
                    </button>

                    <div className="h-px bg-[var(--glass-border)] my-1" />

                    {[{ label: 'All Records', role: 'all', icon: 'groups' }, { label: 'Employees Only', role: 'Employee', icon: 'badge' }, { label: 'Guests Only', role: 'Guest', icon: 'person_search' }].map(opt => (
                      <button key={opt.role} onClick={() => { downloadCsv(`/api/export/attendance${opt.role !== 'all' ? `?role=${opt.role}` : ''}`, `attendance_${opt.role.toLowerCase()}.csv`); setShowExportMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors text-left">
                        <span className="material-symbols-outlined text-sm">{opt.icon}</span>{opt.label}
                      </button>
                    ))}

                    {allEvents.length > 0 && (
                      <>
                        <div className="h-px bg-[var(--glass-border)] my-1" />
                        <div className="px-4 py-1.5">
                          <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">By Event</span>
                        </div>
                        {allEvents.map(ev => (
                          <button key={ev.id} onClick={() => {
                            const evFrom = ev.start_date;
                            const evTo = ev.end_date || ev.start_date;
                            downloadCsv(`/api/export/attendance?date_from=${evFrom}&date_to=${evTo}T23:59:59`, `attendance_${ev.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.csv`);
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
          )}
          <button onClick={handleRefresh}
            className="glass-card flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* ─── EVENT ATTENDANCE VIEW ──────────────────── */}
      {selectedEventId !== null && (
        eventAttendanceLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : eventAttendance ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Scans', value: eventAttendance.total_scans, icon: 'sensors', bg: 'bg-blue-500/15', text: 'text-blue-400' },
                { label: 'Attendees', value: eventAttendance.unique_people, icon: 'groups', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
                { label: 'Employees', value: eventAttendance.employees, icon: 'badge', bg: 'bg-sky-500/15', text: 'text-sky-400' },
                { label: 'Guests', value: eventAttendance.guests, icon: 'person_search', bg: 'bg-amber-500/15', text: 'text-amber-400' },
              ].map(stat => (
                <div key={stat.label} className="glass-card rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`material-symbols-outlined text-sm ${stat.text}`}>{stat.icon}</span>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">{stat.label}</span>
                  </div>
                  <p className="text-xl font-bold text-[var(--text-primary)]">{stat.value}</p>
                </div>
              ))}
            </div>

            {filteredAttendees.length === 0 ? (
              <EmptyState icon="group_off" title="No attendees found" description={search ? 'No attendees match your search' : 'No attendance recorded for this event'} />
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--accent)] text-sm">event</span>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{selectedEvent?.title}</h3>
                    <span className="text-[10px] text-[var(--text-muted)]">{selectedEvent?.start_date}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{filteredAttendees.length} attendees</span>
                </div>
                <div className="w-full overflow-x-auto glass-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-[var(--glass-border)]">
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Person</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">First Scan</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Scan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--glass-border)]">
                      {filteredAttendees.map(a => (
                        <tr key={a.user_id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              {getImageUrl(a.image_url) ? (
                                <img src={getImageUrl(a.image_url)!} alt={a.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-blue-400 text-xs">person</span>
                                </div>
                              )}
                              <span className="font-semibold text-[var(--text-primary)] text-xs">{a.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{a.user_id}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${a.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{a.role}</span>
                          </td>
                          <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatDateTime(a.first_scan)}</td>
                          <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatDateTime(a.last_scan)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--glass-border)]">
                  <p className="text-xs text-[var(--text-muted)]">{filteredAttendees.length} attendees</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="event_busy" title="Event not found" description="Could not load attendance for this event" />
        )
      )}

      {/* ─── DATE-FILTERED ATTENDANCE LOGS ──────────── */}
      {selectedEventId === null && (dateFrom || dateTo) && (
        logsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState icon="search_off" title="No records found" description={`No attendance records for ${dateFrom || '...'}${dateTo ? ` to ${dateTo}` : ''}`} />
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent)] text-sm">history</span>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Attendance Records</h3>
                <span className="text-[10px] text-[var(--text-muted)]">{dateFrom}{dateTo ? ` — ${dateTo}` : ''}</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono bg-white/[0.06] px-2 py-0.5 rounded-md">{attendanceLogs?.total || 0} total</span>
            </div>
            <div className="w-full overflow-x-auto glass-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Person</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Time</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Camera</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-border)]">
                  {filteredLogs.map(item => (
                    <tr key={item.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {getImageUrl(item.image_url) ? (
                            <img src={getImageUrl(item.image_url)!} alt={item.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-blue-400 text-xs">person</span>
                            </div>
                          )}
                          <span className="font-semibold text-[var(--text-primary)] text-xs">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{item.user_id}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${item.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{item.role}</span>
                      </td>
                      <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatDateTime(item.timestamp)}</td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                        <span className="capitalize">{getCameraDept(item.camera_id) || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ring-1 ${
                          item.status === 'in' ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' : 'bg-red-500/15 text-red-400 ring-red-500/20'
                        }`}>{item.status.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {attendanceLogs && attendanceLogs.total > 100 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--glass-border)]">
                <p className="text-xs text-[var(--text-muted)]">Page {logsPage} of {Math.ceil(attendanceLogs.total / 100)}</p>
                <div className="flex items-center gap-2">
                  <button disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    Previous
                  </button>
                  <button disabled={logsPage >= Math.ceil(attendanceLogs.total / 100)} onClick={() => setLogsPage(p => p + 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ─── REAL-TIME: WHO'S IN ────────────────────── */}
      {!isFiltered && activeTab === 'in' && (
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

      {/* ─── REAL-TIME: WHO'S NOT IN ───────────────── */}
      {!isFiltered && activeTab === 'out' && (
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
