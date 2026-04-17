import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../auth';
import { API_BASE } from '../config';
import { downloadCsv } from '../utils/download';
import { EmptyState } from '../components/EmptyState';
import { HoverCard } from '../components/HoverCard';

interface LogEntry {
  id: number;
  user_id: string;
  name: string;
  image_url: string | null;
  role: string;
  status: string;
  confidence: number;
  timestamp: string;
  camera_id: string | null;
}

interface LogResponse {
  total: number;
  page: number;
  per_page: number;
  items: LogEntry[];
}

function HistoryPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cameraFilter, setCameraFilter] = useState('');
  const [cameras, setCameras] = useState<string[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '30');
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (cameraFilter) params.set('camera_id', cameraFilter);
      if (search) params.set('user_id', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await authFetch(`/api/attendance?${params.toString()}`);
      if (res.ok) {
        const data: LogResponse = await res.json();
        let items = data.items;
        if (roleFilter !== 'all') {
          items = items.filter(i => i.role === roleFilter);
        }
        if (search) {
          const q = search.toLowerCase();
          items = items.filter(i => i.name?.toLowerCase().includes(q) || i.user_id?.toLowerCase().includes(q));
        }
        setLogs(items);
        setTotal(data.total);
        setTotalPages(Math.ceil(data.total / data.per_page));
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, search, roleFilter, statusFilter, cameraFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, search, roleFilter, statusFilter, cameraFilter]);

  // Fetch camera list for filter dropdown
  useEffect(() => {
    authFetch('/api/cameras').then(r => r.ok ? r.json() : []).then(data => {
      setCameras(data.map((c: { camera_id: string }) => c.camera_id));
    }).catch(() => {});
  }, []);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatDateTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (cameraFilter) params.set('camera_id', cameraFilter);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    const qs = params.toString();
    downloadCsv(`/api/export/attendance${qs ? `?${qs}` : ''}`, 'history_export.csv');
  };

  return (
    <div className="flex flex-col w-full pb-10 page-enter">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">search</span>
          <input type="text" placeholder="Search name or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 glass-card rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="glass-card px-3 py-2 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)]" />
        <span className="text-[var(--text-muted)] text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="glass-card px-3 py-2 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)]" />
        <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
          {['all', 'Employee', 'Guest'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${roleFilter === r ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
        </div>
        <div className="glass-card flex items-center rounded-xl overflow-hidden p-0.5">
          {['all', 'in', 'out'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase transition-all ${
                statusFilter === s
                  ? s === 'in' ? 'bg-emerald-500 text-white shadow-sm'
                    : s === 'out' ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        {cameras.length > 0 && (
          <select value={cameraFilter} onChange={e => setCameraFilter(e.target.value)}
            className="glass-card px-3 py-2 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] capitalize">
            <option value="">All Cameras</option>
            {cameras.map(c => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleExport}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer">
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
          <button onClick={fetchLogs}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon="history" title="No records found" description="Adjust your filters or wait for new scan events" />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="w-full overflow-x-auto glass-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Person</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Confidence</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Camera</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-border)]">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3">
                      <HoverCard name={log.name} type={log.role?.toLowerCase() === 'guest' ? 'guest' : 'employee'} imageUrl={log.image_url || undefined} confidence={log.confidence} cameraId={log.camera_id} status={log.status}>
                        <div className="flex items-center gap-2.5 cursor-pointer">
                          {getImageUrl(log.image_url) ? (
                            <img src={getImageUrl(log.image_url)!} alt={log.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--glass-border)] shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-blue-400 text-xs">person</span>
                            </div>
                          )}
                          <span className="font-semibold text-[var(--text-primary)] text-xs">{log.name || 'Unknown'}</span>
                        </div>
                      </HoverCard>
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono">{log.user_id}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                        log.role === 'Guest' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>{log.role || 'Unknown'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ring-1 ${
                        log.status === 'in'
                          ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
                          : 'bg-red-500/15 text-red-400 ring-red-500/20'
                      }`}>{log.status?.toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 w-24">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: `${Math.min(log.confidence, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] w-8 text-right">{log.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--text-muted)] capitalize">{log.camera_id?.replace(/-/g, ' ') || '—'}</td>
                    <td className="px-5 py-3 text-[11px] font-mono text-[var(--text-muted)]">{formatDateTime(log.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--glass-border)]">
            <p className="text-xs text-[var(--text-muted)]">{total.toLocaleString()} total records</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Previous
              </button>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistoryPage;
