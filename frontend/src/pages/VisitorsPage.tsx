import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../auth';
import { API_BASE } from '../config';
import { downloadCsv } from '../utils/download';

interface Visitor {
  id: string;
  name: string;
  image_url: string | null;
  first_seen: string | null;
  last_seen: string | null;
  total_visits: number;
  entries_count: number;
  exits_count: number;
  last_camera: string | null;
  last_status: string | null;
}

interface VisitorsResponse {
  total: number;
  page: number;
  per_page: number;
  items: Visitor[];
}

function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (search) params.set('search', search);

      const res = await authFetch(`/api/visitors?${params.toString()}`);
      if (res.ok) {
        const data: VisitorsResponse = await res.json();
        setVisitors(data.items);
        setTotal(data.total);
        setTotalPages(Math.ceil(data.total / data.per_page));
      }
    } catch (e) {
      console.error('Failed to fetch visitors:', e);
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, search]);

  useEffect(() => { fetchVisitors(); }, [fetchVisitors]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, search]);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API_BASE}${url}` : url;
  };

  const formatDateTime = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString();
    } catch { return ts; }
  };

  const handleDelete = async (visitor: Visitor) => {
    if (!confirm(`Delete visitor "${visitor.name}" (${visitor.id})? This will remove all their logs and cannot be undone.`)) return;
    setDeletingId(visitor.id);
    try {
      const res = await authFetch(`/api/employees/${encodeURIComponent(visitor.id)}`, { method: 'DELETE' });
      if (res.ok) fetchVisitors();
    } catch (e) {
      console.error('Failed to delete visitor:', e);
    }
    setDeletingId(null);
  };

  return (
    <div className="flex flex-col w-full pb-10">
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
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => downloadCsv('/api/export/visitors', 'visitors_export.csv')}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer">
            <span className="material-symbols-outlined text-sm">download</span>
            Export
          </button>
          <button onClick={fetchVisitors}
            className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : visitors.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-3 block">person_search</span>
            <p className="text-slate-400">{search || dateFrom || dateTo ? 'No visitors found for selected filters.' : 'No visitors registered yet.'}</p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Photo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name/ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">First Seen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Seen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Entries</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Exits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Camera</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {visitors.map(visitor => (
                  <tr key={visitor.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-4 py-3">
                      {getImageUrl(visitor.image_url) ? (
                        <img src={getImageUrl(visitor.image_url)!} alt={visitor.name} className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)]" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{visitor.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{visitor.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(visitor.first_seen)}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{formatDateTime(visitor.last_seen)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {visitor.entries_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {visitor.exits_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400">
                        {visitor.total_visits}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {visitor.last_status ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          visitor.last_status === 'in' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${visitor.last_status === 'in' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {visitor.last_status === 'in' ? 'IN' : 'OUT'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 capitalize">{visitor.last_camera?.replace(/-/g, ' ') || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(visitor)}
                        disabled={deletingId === visitor.id}
                        className="p-1.5 hover:bg-red-500/15 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete visitor"
                      >
                        <span className="material-symbols-outlined text-red-400 text-lg">
                          {deletingId === visitor.id ? 'hourglass_empty' : 'delete'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <p className="text-sm text-slate-400">{total} total visitors</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Previous
              </button>
              <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VisitorsPage;
