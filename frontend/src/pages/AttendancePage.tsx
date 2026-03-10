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

interface AttendanceEvent {
  id: number;
  user_id: string;
  status: string;
  confidence: number;
  timestamp: string;
  camera_id: string | null;
  name: string;
  image_url: string | null;
  role: string;
}

interface Camera {
  camera_id: string;
  department: string;
}

function AttendancePage() {
  // Who's In panel
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);

  // Event log
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchPerson, setSearchPerson] = useState('');
  const [filterCamera, setFilterCamera] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [cameras, setCameras] = useState<Camera[]>([]);

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

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (searchPerson) params.set('user_id', searchPerson);
      if (filterCamera) params.set('camera_id', filterCamera);
      if (filterStatus) params.set('status', filterStatus);

      const res = await authFetch(`/api/attendance?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.items);
        setTotal(data.total);
        setTotalPages(Math.ceil(data.total / data.per_page));
      }
    } catch (e) {
      console.error('Failed to fetch events:', e);
    } finally {
      setEventsLoading(false);
    }
  }, [page, dateFrom, dateTo, searchPerson, filterCamera, filterStatus]);

  const fetchCameras = useCallback(async () => {
    try {
      const res = await authFetch('/api/cameras');
      if (res.ok) setCameras(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchActive(); fetchCameras(); }, [fetchActive, fetchCameras]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(getAuthWsUrl('/ws/dashboard'));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'recognition_result') {
          // Refresh active users when someone clocks in/out
          fetchActive();
        }
      } catch {}
    };

    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => ws.close();

    return () => { ws.close(); };
  }, [fetchActive]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, searchPerson, filterCamera, filterStatus]);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ts; }
  };

  const formatDateTime = (ts: string) => {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Attendance</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time attendance tracking and event history.</p>
        </div>
        <button onClick={() => { fetchActive(); fetchEvents(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {/* Who's In Right Now */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-500">groups</span>
          Who's In Right Now
          <span className="text-sm font-normal text-slate-400">({activeUsers.length})</span>
        </h3>

        {activeLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : activeUsers.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2 block">person_off</span>
            <p className="text-slate-500 dark:text-slate-400">No one currently on site</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {activeUsers.map(user => (
              <div key={user.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex items-center gap-3">
                {getImageUrl(user.image_url) ? (
                  <img src={getImageUrl(user.image_url)!} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      user.role === 'Guest' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
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

      {/* Event Log */}
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Event Log</h3>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all" />
        <input type="text" placeholder="Search person..." value={searchPerson} onChange={e => setSearchPerson(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all w-40" />
        <select value={filterCamera} onChange={e => setFilterCamera(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all">
          <option value="">All Cameras</option>
          {cameras.map(c => <option key={c.camera_id} value={c.camera_id}>{c.department || c.camera_id}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all">
          <option value="">All Status</option>
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
      </div>

      {/* Table */}
      {eventsLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2 block">event_busy</span>
          <p className="text-slate-500 dark:text-slate-400">No attendance events found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Person</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Camera</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Confidence</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {events.map(evt => (
                  <tr key={evt.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {getImageUrl(evt.image_url) ? (
                          <img src={getImageUrl(evt.image_url)!} alt={evt.name} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-600" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-400 text-xs">person</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{evt.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                        evt.role === 'Guest' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>{evt.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                        evt.status === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${evt.status === 'in' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {evt.status === 'in' ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 capitalize">{evt.camera_id?.replace(/-/g, ' ') || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(evt.confidence, 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{evt.confidence.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(evt.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">{total} total events</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Previous
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendancePage;
