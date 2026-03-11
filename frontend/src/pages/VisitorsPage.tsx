import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../auth';
import { API_BASE } from '../config';

interface Visitor {
  id: string;
  name: string;
  image_url: string | null;
  first_seen: string | null;
  last_seen: string | null;
  total_visits: number;
  last_camera: string | null;
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

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '50');
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

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
  }, [page, dateFrom, dateTo]);

  useEffect(() => { fetchVisitors(); }, [fetchVisitors]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

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

  return (
    <div className="flex flex-col h-full w-full bg-slate-50/50 dark:bg-slate-900 overflow-y-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Visitors</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Read-only guest visit history and statistics.</p>
        </div>
        <button onClick={fetchVisitors}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm outline-none focus:border-blue-500 transition-all" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : visitors.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">person_search</span>
            <p className="text-slate-500 dark:text-slate-400">{dateFrom || dateTo ? 'No visitors found for selected date range.' : 'No visitors registered yet.'}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Photo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name/ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">First Seen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Seen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Visits</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Camera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {visitors.map(visitor => (
                  <tr key={visitor.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      {getImageUrl(visitor.image_url) ? (
                        <img src={getImageUrl(visitor.image_url)!} alt={visitor.name} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{visitor.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{visitor.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(visitor.first_seen)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(visitor.last_seen)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {visitor.total_visits}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 capitalize">{visitor.last_camera?.replace(/-/g, ' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">{total} total visitors</p>
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

export default VisitorsPage;
